'use strict';


/**
 * Construct all of the application urls 
 */
let URL_LOCATION            =  location.hostname;
let URL_PROTOCOL            =  location.protocol;
let URL_PORT                =  location.port;          
let URL_HOST_BASE           =  URL_LOCATION;
if (parseInt(URL_PORT) > 0) {
    URL_HOST_BASE += `:${URL_PORT}`;
}
let URL_HOST_PROTOCOL       = `${URL_PROTOCOL}//`;
let URL_SERVER              = `${URL_HOST_PROTOCOL}${URL_HOST_BASE}`;
let URL_WINSOCK             = `ws://${URL_LOCATION}:`;
let URL_GET_TILESETS        = `${URL_SERVER}/tiles/tilesets`;
let URL_GET_VFRSEC_TILE     = `${URL_SERVER}/tiles/vfrsectile/{z}/{x}/{-y}.png`;
let URL_GET_TERM_TILE       = `${URL_SERVER}/tiles/termtile/{z}/{x}/{-y}.png`;
let URL_GET_HELI_TILE       = `${URL_SERVER}/tiles/helitile/{z}/{x}/{-y}.png`;
let URL_GET_CARIB_TILE      = `${URL_SERVER}/tiles/caribtile/{z}/{x}/{-y}.png`;
let URL_GET_GCAO_TILE       = `${URL_SERVER}/tiles/gcaotile/{z}/{x}/{-y}.png`;
let URL_GET_GCGA_TILE       = `${URL_SERVER}/tiles/gcgatile/{z}/{x}/{-y}.png`;
let URL_GET_HISTORY         = `${URL_SERVER}/gethistory`;
let URL_GET_SETTINGS        = `${URL_SERVER}/getsettings`;
let URL_PUT_HISTORY         = `${URL_SERVER}/puthistory`;
let URL_GET_AIRPORTS        = `${URL_SERVER}/getairports`;
let URL_GET_HELIPORTS       = `${URL_SERVER}/getheliports`;


/**
 * global properties
 */
let settings = {};
let last_longitude = 0;
let last_latitude = 0;
let last_heading = 0;
let currentZoom = 9;
let lastcriteria = "allregions";

let airportNameKeymap = new Map();
let tafFieldKeymap = new Map();
let metarFieldKeymap = new Map();
let weatherAcronymKeymap = new Map();
let icingCodeKeymap = new Map();
let turbulenceCodeKeymap = new Map();
let skyConditionKeymap = new Map();

loadTafFieldKeymap();
loadMetarFieldKeymap();
loadWeatherAcronymKeymap();
loadTurbulenceCodeKeymap();
loadIcingCodeKeymap();
loadSkyConditionmKeymap();

/**
 * ol.Collections hold features like
 * metars, tafs, airport info, etc.
 */
let metarFeatures = new ol.Collection();
let airportFeatures = new ol.Collection();
let tafFeatures = new ol.Collection();
let pirepFeatures = new ol.Collection();

/**
 * Vector sources
 */
let metarVectorSource;
let airportVectorSource;
let tafVectorSource;
let pirepVectorSource;
let ownshipVectorSource;
let animatedWxTileSource;

/**
 * Vector layers
 */
let airportVectorLayer;
let metarVectorLayer;
let tafVectorLayer;
let pirepVectorLayer;

/**
 * Tile layers
 */
let osmTileLayer;
let sectionalTileLayer;
let terminalTileLayer;
let helicopterTileLayer;
let caribbeanTileLayer;
let grandcanyonAoTileLayer;
let grandcanyonGaTileLayer;
let animatedWxTileLayer;
let debugTileLayer;  

/**
 * Websocket object, flag, and message definition
 * JSON object that is filled by returned settingsws://${window.location.hostname}
 */
let websock;
let wsOpen = false;
let MessageTypes = {};
let DistanceUnits = {};
let distanceunit = "";

/**
 * Animation variables 
 */
let animationId = null;
let startDate = getTimeThreeHoursAgo();
let frameRate = 1.0; // frames per second
const animatecontrol = document.getElementById('wxbuttons');

/**
 * Controls for dropdown select when viewing all airports
 */
const regioncontrol = document.getElementById('isoregion');
const regionselect = document.getElementById("regionselect");
let regionmap = new Map();

/** 
 * Request settings JSON object from serverself
 */
 $.get({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: (data) => {
        try {
            settings = JSON.parse(data);
            MessageTypes = settings.messagetypes;
            DistanceUnits = settings.distanceunits;
            distanceunit = settings.distanceunit;
            currentZoom = settings.startupzoom;
        }
        catch(err) {
            console.log(err);
        }
    },
    error: (xhr, ajaxOptions, thrownError) => {
        console.error(xhr.status, thrownError);
    }
});

/**
 * Request Initial ownship position latitude & longitude.
 * Data is stored in the sqlite positionhistory.db file.
 * This will also center the viewport on that position.
 */
 $.get({
    async: false,
    type: "GET",
    url: URL_GET_HISTORY,
    success: (data) => {
        try {
            let histobj = JSON.parse(data);
            last_longitude = histobj.longitude;
            last_latitude = histobj.latitude;
            last_heading = histobj.heading;
        }
        catch (err) {
            console.log(err);
        }
    },
    error: (xhr, ajaxOptions, thrownError) => {
        console.error(xhr.status, thrownError);
    }
});

/**
 * JQuery method to immediately initialize the websocket connection
 */
 $(() => { 
    try {
        let wsurl = `${URL_WINSOCK}${settings.wsport}`;
        console.log(`OPENING: ${wsurl}`);
        websock = new WebSocket(wsurl);
        websock.onmessage = (evt) => {
            let message = JSON.parse(evt.data);
            let payload = JSON.parse(message.payload); 
            switch (message.type) {
                case MessageTypes.airports.type:
                    processAirports(payload);
                    break;
                case MessageTypes.metars.type:
                    processMetars(payload);
                    break;
                case MessageTypes.tafs.type:
                    processTafs(payload);
                    break;
                case MessageTypes.pireps.type:
                    processPireps(payload);
                    break;
            }
        }

        websock.onerror = function(evt){
            console.log("Websocket ERROR: " + evt.data);
        }
        
        websock.onopen = function(evt) {
            console.log("Websocket CONNECTED.");
            wsOpen = true;
            keepAlive();
        }
        
        websock.onclose = function(evt) {
            cancelKeepAlive();
            wsOpen = false;
            console.log("Websocket CLOSED.");
        }
    }
    catch (error) {
        console.log(error);
    }
});

/**
 * Icon markers for different METAR categories 
 */
 let ifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let lifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let mvfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let vfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});

/**
 * Icon markers for different PIREP weather categories
 */
let ifrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let lifrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let mvfrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let vfrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});

/**
 * Icon markers for airports, TAFs, heliports, etc.
 */
let tafMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/taf.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let airportMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/dot.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let heliportMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/helipad.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let pirepMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/pirep.png`,
    size:[85, 85],
    offset: [0,0],
    opacity: 1,
    scale: .50
});

/**
 * ol.Style objects 
 */
const vfrStyle = new ol.style.Style({
    image: vfrMarker
});
const mvfrStyle = new ol.style.Style({
    image: mvfrMarker
});
const ifrStyle = new ol.style.Style({
    image: ifrMarker
});
const lifrStyle = new ol.style.Style({
    image: lifrMarker
});
const tafStyle = new ol.style.Style({
    image: tafMarker
})
const airportStyle = new ol.style.Style({
    image: airportMarker
});
const heliportStyle = new ol.style.Style({
    image: heliportMarker
});
const pirepStyle = new ol.style.Style({
    image: pirepMarker
});

/**
 * Async $get for list of airports
 */
$.get({
    async: true,
    type: "GET",
    url: URL_GET_AIRPORTS,
    error: function (request, status, err) {
        console.error(`ERROR GETTING AIRPORTS: ${err}`);
    }
});

/**
 * Load airports into their feature collection 
 * @param {jsonobj} airport JSON object 
 */
function processAirports(jsonobj) {
    let usastates = new Map();
    let isoregions = new Map();
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let isoregion = airport.isoregion;
            let country = airport.country;
            if (isoregion.search("US-") > -1) { 
                usastates.set(country, country);
            } 
            else {
                isoregions.set(country, country);
            }
            let airportmarker = new ol.Feature({
                ident: airport.ident,
                type: airport.type,
                isoregion: isoregion,
                country: country,
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
            });
            airportmarker.setId(airport.ident);
            if (airport.type === "heliport") {
                airportmarker.setStyle(heliportStyle);
            }
            else {
                airportmarker.setStyle(airportStyle);
            }
            airportFeatures.push(airportmarker);
            airportNameKeymap.set(airport.ident, airport.name);
        }

        /**
         * This is for the region select dropdown list
         * Map sort all region airports in alpha order by US state 
         * we want US states to be at the top of the list followed
         * by the rest of the isoregions 
         */
        usastates[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        usastates.forEach((country, isoregion) => {
            let option = document.createElement("option");
            option.value = isoregion;
            option.text = country;
            regionselect.appendChild(option);
        });
        
        regionmap[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        isoregions.forEach((country, isoregion) => { 
            let option = document.createElement("option");
            option.value = isoregion;
            option.text = country;
            regionselect.appendChild(option);
        });
    }
    catch(err){
        console.error(err);
    }
}

/**
 * Region dropdown select event
 */
regionselect.addEventListener('change', (event) => {
    lastcriteria = event.target.value;
    selectFeaturesByCriteria();
});

/**
 * Called by select event to manipulate features
 * @param {*} criteria: string
 */
function selectFeaturesByCriteria() {
    airportFeatures.forEach((feature) => {
        let type = feature.get("type");
        let country = feature.get("country");
        if (type === "heliport") {
            feature.setStyle(heliportStyle);
        }
        else {
            feature.setStyle(airportStyle);
        }
        if (lastcriteria === "small_airport" || lastcriteria === "medium_airport" || 
            lastcriteria === "large_airport" || lastcriteria === "heliport") {
            if (type !== lastcriteria) {
                feature.setStyle(new ol.style.Style(undefined));
            }
        }
        else if (country !== lastcriteria && lastcriteria !== "allregions") {
            feature.setStyle(new ol.style.Style(undefined));        
        }
    });
}

/**
 * Heartbeat routine to keep websocket "hot"
 */
let timerId = 0;
const kamessage = {
    type: MessageTypes.keepalive.type,
    payload: MessageTypes.keepalive.token
}
function keepAlive() { 
    var timeout = settings.keepaliveintervalmsec;  
    if (wsOpen) {  
        websock.send(JSON.stringify(kamessage));  
    }  
    timerId = setTimeout(keepAlive, timeout);  
}  
function cancelKeepAlive() {  
    if (timerId) {  
        clearTimeout(timerId);  
    }  
}

/**
 * Metar popup object
 */
const popup = document.getElementById('popup');
const popupcontent = document.getElementById('popup-content');
const popupcloser = document.getElementById('popup-closer');
const popupoverlay = new ol.Overlay({
    element: popup,
    autoPan: true,
    autoPanAnimation: {
      duration: 500,
    },
});
/**
 * Metar popup closer
 * @returns false!!
 */
popupcloser.onclick = () => {
    popupoverlay.setPosition(undefined);
    popupcloser.blur();
    return false;
};

/**
 * Ownship image 
 */
let airplaneElement = document.getElementById('airplane');
airplaneElement.style.transform = "rotate(" + last_heading + "deg)";
airplaneElement.src = `img/${settings.ownshipimage}`;
airplaneElement.addEventListener("mouseover", (event) => {
    console.log("MY AIRPLANE!!")
});

/**
 * set the global view position from last saved history 
 */
let viewposition = ol.proj.fromLonLat([last_longitude, last_latitude]);

/**
 * Viewport extent for setting up map view
 */
let viewextent = [-180, -85, 180, 85];
let offset = [-18, -18];

/**
 * The scale of miles shown on lower left corner of map
 */
const scaleLine = new ol.control.ScaleLine({
    units: 'imperial',
    bar: true,
    steps: 4,
    minWidth: 140
});

/**
 * The map object that gets put in index.html <div> element
 */
const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: viewposition,        
        zoom: settings.startupzoom,
        enableRotation: false
    }),
    controls: ol.control.defaults().extend([scaleLine]),
    overlays: [popupoverlay]
});

/**
 * The actual positioning of the ownship image feature
 */
const myairplane = new ol.Overlay({
    element: airplaneElement
});
myairplane.setOffset(offset);
myairplane.setPosition(viewposition);
map.addOverlay(myairplane);

/**
 * Event to handle scaling of feature images
 */
map.on('pointermove', (evt) => {
    //let hasfeature = false;
    let someZoom = map.getView().getZoom();
    let inAnimation = false;
    if (currentZoom !== someZoom) {
        currentZoom = someZoom;
        if (animationId !== null) {
            inAnimation = true;
            stopWeatherRadar();
        }
        resizeDots();
        popupcloser.onclick();
        if (inAnimation) {
            playWeatherRadar();
        }
    }
});

/**
 * Event to view Metar/TAF popup & closure
 */
map.on('click', (evt) => {
    let hasfeature = false;
    currentZoom = map.getView().getZoom();
    resizeDots();
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        if (feature) {
            hasfeature = true;
            let datatype = feature.get("datatype");
            if (datatype === "metar") {
                displayMetarPopup(feature);
            }
            else if (datatype === "taf"){
                displayTafPopup(feature);
            }
            else if (datatype === "pirep") {
                displayPirepPopup(feature);
            }
            else { // simple airport marker
                displayAirportPopup(feature);
            }
            let coordinate = evt.coordinate;
            popupoverlay.setPosition(coordinate);
        }
    });
    if (!hasfeature) {
        popupcloser.onclick();
    }
});

/**
 * Create the html for a METAR popup element
 * @param {feature} ol.Feature: the metar feature the user clicked on 
 */
function displayMetarPopup(feature) {
    let metar = feature.get("metar");
    let ident = metar.station_id;
    let cat = metar.flight_category;
    if (cat == undefined || cat == "undefined"){
        cat = "VFR";
    }
    let time = metar.observation_time;
    if (settings.uselocaltime) {
        time = getLocalTime(time);
    }
    let tempC = metar.temp_c;
    let dewpC = metar.dewpoint_c;
    let temp = convertCtoF(metar.temp_c);
    let dewp = convertCtoF(metar.dewpoint_c);
    let windir = metar.wind_dir_degrees;
    let winspd = metar.wind_speed_kt + "";
    let wingst = metar.wind_gust_kt + ""; 
    let altim = getAltimeterSetting(metar.altim_in_hg);
    let vis = getDistanceUnits(metar.visibility_statute_mi);
    let wxcode = metar.wx_string !== undefined ? decodeWxDescriptions(metar.wx_string) : "";
    let taflabelcssClass = "taflabel"
    let skycondition = metar.sky_condition;
    let skyconditions;
    let icingconditions;
    if (skycondition !== undefined) {
        skyconditions = decodeSkyCondition(skycondition, taflabelcssClass);
    }
    let icingcondition = metar.icing_condition;
    if (icingcondition !== undefined) {
        icingconditions = decodeIcingOrTurbulenceCondition(icingcondition, taflabelCssClass);
    }
    let label = `<label class="#class">`;
    let css;
    switch(cat) {
        case "IFR":
            css = label.replace("#class", "metarifr");
            break;
        case "LIFR":
            css = label.replace("#class", "metarlifr");
            break;
        case "MVFR":
            css = label.replace("#class", "metarmvfr");
            break;
        case "VFR":
            css = label.replace("#class", "metarvfr");
            break;
    }
    if (ident != "undefined") {
        let name = getFormattedAirportName(ident);
        let html = `<div id="#featurepopup"><pre><code><p>`
        html +=    `${css}${name}\n${ident} - ${cat}</label><p></p>`;
        html +=   (time != "" && time != "undefined") ? `Time:&nbsp<b>${time}</b><br/>` : "";
        html +=   (temp != "" && temp != "undefined") ? `Temp:&nbsp<b>${tempC} °C</b> (${temp})<br/>` : "";
        html +=   (dewp != "" && dewp != "undefined") ?`Dewpoint:&nbsp<b>${dewpC} °C</b> (${dewp})<br/>` : "";
        html += (windir != "" && windir != "undefined") ? `Wind Direction:&nbsp<b>${windir}°</b><br/>` : "";
        html += (winspd != "" && winspd != "undefined") ? `Wind Speed:&nbsp<b>${winspd}&nbspkt</b><br/>` : "";
        html += (wingst != "" && wingst != "undefined") ? `Wind Gust:&nbsp<b>${wingst}&nbspkt</b><br/>` : "";
        html +=  (altim != "" && altim != "undefined") ? `Altimeter:&nbsp<b>${altim}&nbsphg</b><br/>` : "";
        html +=    (vis != "" && vis != "undefined") ? `Horizontal Visibility:&nbsp<b>${vis}</b><br/>` : "";
        html += (wxcode != "" && wxcode != "undefined") ? `Weather:&nbsp<b>${wxcode}</b><br/>`: "";
        html += (skyconditions != undefined && skyconditions != "") ? `${skyconditions}` : "";
        html += (icingconditions != undefined && icingconditions != "") ? `${icingconditions}` : "";
        html += `</p></code></pre><br /></div>`;
        popupcloser.style.left = "30px";
        popupcloser.style.top = "88%";
        popupcontent.style.padding = "0px";
        popupcontent.innerHTML = html;  
    }
}

/**
 * Create the html for a TAF popup element
 * @param {feature} ol.Feature: the taf feature the user clicked on
 */
function displayTafPopup(feature) {
    let taf = feature.get("taf");
    let forecast = taf.forecast;
    let outerhtml = `<div class="taftitle">` + 
                        `<label class="taftitlelabel">Terminal Area Forecast - ${feature.get("ident")}</label>` +
                    `</div>` +
                    `<div class="taf">` + 
                        `<pre><code>` +
                        `<table class="tafmessage" id="taftable">` +
                            `<tr class="tafbody">` + 
                                `<td id="tafdata">###</td>` +
                            `</tr>` +
                        `</table>` +
                        `</code></pre>` +                 
                    `</div>` + 
                    `<br /><br />`;

    let html = "<div>";
    
    for (const item in forecast) {
        let value = forecast[item];
        if (typeof(value) === 'object') {
            for (const subitem in value) {
                let subvalue = value[subitem];
                html += parseForecastField(subitem, subvalue);
            }
            html += "</p><hr>";
        } 
        else {
            html += parseForecastField(item, value);
        }
    }
    html += "</div>";

    console.log(html);
    
    let innerhtml = outerhtml.replace("###", html);
    popupcloser.style.left = "28px";
    popupcloser.style.top = "93%";
    popupcontent.style.padding = "0px";
    popupcontent.innerHTML = innerhtml;
}

function parseForecastField(rawfieldname, fieldvalue) {
    let fieldname = tafFieldKeymap.get(rawfieldname);
    let html = "";
    let formattedvalue = "";
    switch (rawfieldname) {
        case "fcst_time_from":
            let thistime = fieldvalue;
            if (settings.uselocaltime) {
                thistime = getLocalTime(fieldvalue);
            }
            html = `<label class="fcstlabel"><b>Starting at: ${thistime}</b></label></b><br />`;
            break;
        case "fcst_time_to": // I'm going to ignore this field to save space on the popup
            //html = `&nbspto&nbsp<b>${fieldvalue}</b></label><br />`
            //html = `<label class="fcstlabel">${formattedvalue}</label><br />`;
            break;
        case "change_indicator":
        case "time_becoming":
        case "probability":
        case "wind_dir_degrees":
        case "wind_speed_kt":
        case "wind_gust_kt":
        case "wind_shear_hgt_ft_agl":
        case "wind_shear_dir_degrees":
        case "wind_shear_speed_kt":
        case "altim_in_hg":
        case "vert_vis_ft":
        case "wx_string":
            if (fieldname === "wx_string") {
                formattedvalue = decodeWxDescriptions(fieldvalue);
                html = `<label class="tafwxlabel">${fieldname}: <b>${formattedvalue}</b></label><br />`;
            }
            else {
                html = `<label class="taflabel">${fieldname}: <b>${fieldvalue}</b></label><br />`;
            }
            break;
        case "sky_condition":
            formattedvalue = decodeSkyCondition(fieldvalue);
            html = `<label class="tafskyheader">${fieldname}</label><br />${formattedvalue}`;
            break;
        case "turbulence_condition":
        case "icing_condition":
            formattedvalue = decodeIcingCondition(fieldvalue);
            html = `<label class="tafskyheader">${fieldname}</label><br />${formattedvalue}`;
            break;
        case "temperature":
            break;

    }
    return html;
}

/**
 * Create the html for a PIREP popup element
 * @param {object} feature: the pirep the user clicked on
 */
 function displayPirepPopup(feature) {
    let pirep = feature.get("pirep");
    let outerhtml = `<div class="taftitle">` + 
                        `<label class="taftitlelabel">${pirep.pirep_type} FROM AIRCRAFT: ${pirep.aircraft_ref}</label><p></p>` +
                    `</div>` +
                    `<div class="taf">` + 
                        `<pre><code>` +
                        `<table class="tafmessage" id="taftable">` +
                            `<tr class="tafbody">` + 
                                `<td id="tafdata">###</td>` +
                            `</tr>` +
                        `</table>` +
                        `</code></pre>` +                 
                    `</div>` + 
                    `<br /><br />`;

    let html = "<div>";
    let pireplabel = `<label class="pirepitem">`
    let rawpirep = "";
    let thistime = "";
    Object.keys(pirep).forEach((pirepkey) => {
        let pirepvalue = pirep[pirepkey];
        let fieldname = getFieldDescription(pirepkey);
        if (pirepkey.search("raw") > -1) {
            rawpirep = pirepvalue;
        }
        switch (pirepkey) {
            case "receipt_time":
                thistime = pirepvalue;
                if (settings.uselocaltime) {
                    thistime = getLocalTime(pirepvalue);
                }
                html += `${pireplabel}${fieldname}: <b>${thistime}</b></label><br />`;
                break;
            case "observation_time":
                thistime = pirepvalue;
                if (settings.uselocaltime) {
                    thistime = getLocalTime(pirepvalue);
                }
                html += `${pireplabel}${fieldname}: <b>${thistime}</b></label><br />`;
                break;
            case "latitude":
            case "longitude":
            case "altitude_ft_msl":
            case "temp_c":
            case "dewpoint_c":
            case "time_becoming":
            case "probability":
            case "wind_speed_kt":
            case "wind_gust_kt":
            case "wind_shear_hgt_ft_agl":
            case "wind_shear_speed_kt":
            case "vert_vis_ft":
            case "visibility_statute_mi":
                html += `<label class="pirepitem">${fieldname}: <b>${pirepvalue}</b></label><br />`;
                break;
            case "wind_shear_dir_degrees":
            case "wind_dir_degrees":
                html += `${pireplabel}${fieldname}: <b>${pirepvalue}°</b></label><br />`;
                break;
            case "sky_condition":
                html += `<label class="pirepskyheader">${fieldname}</label><br />`;
                html += decodeSkyCondition(pirepvalue, "pirepitem");
                break;
            case "turbulence_condition":
            case "icing_condition":
                html += `<label class="pirepskyheader">${fieldname}</label><br />`;
                html += decodeIcingOrTurbulenceCondition(pirepvalue, "pirepitem");
                break;
            case "temperature":
                html += `<label class="pirepskyheader">Weather</label><br />`;
                break;
            case "altim_in_hg":
                let altimvalue = getInchesOfMercury(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${altimvalue}</b></label><br />`;
                break;
            case "wx_string":
                let lineval = decodeWxDescriptions(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${lineval}</b></label><br />`;
                break;
            case "change_indicator":
                let change = getSkyConditionDescription(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${change}</b></label><br />`;
                break;
            case "pirep_type":
            case "aircraft_ref":
                break;
            default:
                console.log(`${pirepkey} NOT FOUND!`);
                break;
        }
    });
    html += `</p><hr></div><textarea class="rawdata">${rawpirep}</textarea><br />`;
    let innerhtml = outerhtml.replace("###", html);
    popupcloser.style.left = "28px";
    popupcloser.style.top = "93%";
    popupcontent.style.padding = "0px";
    popupcontent.innerHTML = innerhtml;
}

/**
 * Decode sky conditions
 * @param {json object} skyconditions 
 * @param {string} css class to use 
 * @returns html string 
 */
 function decodeSkyCondition(skycondition, labelclassCss) {
    let html = "";
    if (skycondition !== undefined) {
        try {
            let values = Object.values(skycondition);
            for (const x in skycondition) {
                let condition = skycondition[x];
                let fieldname = "";
                let fieldvalue = "";
                if (typeof(condition) !== "string") {
                    for (const index in condition) {
                        fieldname = getFieldDescription(index);
                        fieldvalue = condition[index];
                        html += `<label class="${labelclassCss}">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                    }
                }
                else {
                    fieldname = getFieldDescription(x);
                    fieldvalue = getSkyConditionDescription(condition);
                    html += `<label class="${labelclassCss}">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                }
            }
        }
        catch (error) {
            console.log(error.message);
        }
    }
    return html;
}

/**
 * Get inches of mercury fixed at 2 decimal places
 * @param {float} altimeter 
 * @returns 
 */
function getInchesOfMercury(altimeter) {
    let inhg = parseFloat(altimeter);
    return inhg.toFixed(2);
}

/**
 * Decode icing or turbulence condition
 * @param {json object} conditionobject 
 * @param {string} CSS class to use for the line items
 * @returns html string
 */
function decodeIcingOrTurbulenceCondition(condition, labelclassCss) {
    let html = "";
    let image = "";
    let label = "";
    let conditiontype = "";
    let conditionvalue = "";
    if (condition != undefined) {
        try {
            let condkeys = Object.keys(condition);
            let condvalues = Object.values(condition);
            condkeys.forEach((key) => {
                if (Array.isArray(condvalues[key])) {
                    html = decodeIcingOrTurbulenceCondition(condvalues[key], labelclassCss);
                }
                let fieldname = getFieldDescription(key);
                let fieldvalue = condition[key];
                switch(key) {
                    case "turbulence_type":
                    case "icing_type":
                        conditiontype = fieldname;
                        conditionvalue = fieldvalue;
                        html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                        break; 
                    case "turbulence_intensity":
                    case "icing_intensity":
                        conditiontype = fieldname;
                        image = getConditionImage("turbulence", fieldvalue);
                        html += `<label class="pirepitem">${fieldname}:<br /></label><br />`;
                        html += `<div class="conditionimage"><image src="${URL_SERVER}/img/${image}"><div><br />`;
                        break;
                    case "turbulence_base_ft_msl":
                    case "icing_base_ft_msl":
                        conditiontype = fieldname;
                        conditionvalue = fieldvalue;
                        html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                        break;
                    case "turbulence_top_ft_msl":
                    case "icing_top_ft_msl":
                        conditiontype = fieldname;
                        conditionvalue = fieldvalue;
                        html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label></br />`;
                        break;
                    default:
                        break;
                }
            });
        }
        catch (error) {
            console.log(error.message);
        }
    }
    return html;        
}

/**
 * Get the image that corresponds to icing or turbulence condition
 * @param {string} conditiontype 
 * @param {string} conditionvalue 
 * @returns html image string
 */
function getConditionImage(conditiontype, conditionvalue) {
    let image = "";
    if (conditiontype === "icing") {
        switch (conditionvalue) {
            case "NEGclr":
            case "NEG":
                image = "Nil.png";
                break;
            case "RIME":
            case "TRC":
                image = "IceTrace.png";
                break;
            case "TRC-LGT":
                image = "IceTraceLight.png"
            case "LGT":
                image = "IceLight.png";
                break;
            case "LGT-MOD":
                image = "IceLightMod.png";
                break;
            case "MOD":
                image = "IceMod.png";
                break;
            case "MOD-SEV":
                image = "IceLight.png";
                break;
            case "SEV":
                image = "IceSevere.png";
                break;
        }
    }   
    else if (conditiontype === "turbulence") { 
        switch (conditionvalue) {
            case "NEG":
            case "NEGclr": 
                image = "Nil.png";
                break;
            case "SMTH-LGT":
            case "LGT":
                image = "TurbSmoothLight.png";
            case "LGT-CHOP":
                image = "TurbLight.png";    
                break;
            case "CHOP":
            case "LGT-MOD":
                image = "TurbLightMod.png";
                break;
            case "MOD":
            case "MOD-CHOP":
                image = "TurbMod.png";
                break;
            case "MOD-SEV":
                image = "TurbModSevere.png";
                break;
            case "SEV":
                image = "TurbSevere.png";
                break;
        }
    }
    else {
        image = "";
    }
    
    return image;
}

/**
 * Build the html for an airport feature
 * @param {*} feature: the airport the user clicked on 
 */
function displayAirportPopup(feature) {
    let ident = feature.get("ident");
    let name = getFormattedAirportName(ident)
    let html = `<div id="#featurepopup"><pre><code><p>`;
        html += `<label class="airportpopuplabel">${name} - ${ident}</label><p></p>`;
        html += `</p></code></pre></div>`;
        
        popupcloser.style.left = "27px";
        popupcloser.style.top = "76%";
        popupcontent.style.padding = "15px";
        popupcontent.innerHTML = html;  
}

/**
 * 
 * @param {object} metarsobject: JSON object with LOTS of metars
 */
function processMetars(metarsobject) {
    let newmetars = metarsobject.response.data.METAR;
    if (newmetars !== undefined) {
        metarFeatures.clear();
        try {
            /**
             * Add this metar feature to the metars feature collection
             */
            newmetars.forEach((metar) => {    
                let feature = new ol.Feature({
                    metar: metar,
                    datatype: "metar",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([metar.longitude, metar.latitude])) 
                });
                feature.setId(metar.station_id);
                try {
                    switch (metar.flight_category) {
                        case 'IFR':
                            feature.setStyle(ifrStyle)
                            break;
                        case 'LIFR':
                            feature.setStyle(lifrStyle);
                            break;
                        case 'MVFR':
                            feature.setStyle(mvfrStyle);
                            break;
                        case 'VFR':
                        default:
                            feature.setStyle(vfrStyle);
                            break;
                    }
                    metarFeatures.push(feature);
                }
                catch(error){
                   console.log(error.message); 
                }
            });
        }
        catch(error) {
            console.log(error.message);
        }
    }
}

/**
 * 
 * @param {object} tafsobject: JSON object with LOTS of tafs 
 */
function processTafs(tafsobject) {
    let newtafs = tafsobject.response.data.TAF;
    if (newtafs !== undefined) {
        tafFeatures.clear();
        try {
            newtafs.forEach((taf) => {
                /**
                 * Add this taf to the fafs feature collection
                 */
                let taffeature = new ol.Feature({
                    ident: taf.station_id,
                    taf: taf,
                    datatype: "taf",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([taf.longitude, taf.latitude]))
                });
                taffeature.setId(taf.station_id);
                taffeature.setStyle(tafStyle);
                tafFeatures.push(taffeature);
            });
        }
        catch (error){
            console.log(error.message);
        }
    }
}

/**
 * 
 * @param {object} pirepsobject: JSON object with LOTS of pireps 
 */
 function processPireps(pirepsobject) {
    let newpireps = pirepsobject.response.data.PIREP;
    if (newpireps !== undefined) {
        pirepFeatures.clear();
        try {
            newpireps.forEach((pirep) => {
                let pseudoheading = Math.random()*Math.PI*2;
                
                /**
                 * Add this pirep to the pireps feature collection
                 */
                let pirepfeature = new ol.Feature({
                    ident: pirep.aircraft_ref,
                    pirep: pirep,
                    datatype: "pirep",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([pirep.longitude, pirep.latitude])),
                });
                
                pirepfeature.setId(pirep.aircraft_ref);
                pirepfeature.setStyle(new ol.style.Style({
                                        image: new ol.style.Icon({
                                            crossOrigin: 'anonymous',
                                            src: `${URL_SERVER}/img/pirep.png`,
                                            size:[85, 85],
                                            offset: [0,0],
                                            opacity: 1,
                                            scale: .50,
                                            rotation: pseudoheading
                                        })
                                    })
                );
                pirepFeatures.push(pirepfeature);
            });
        }
        catch (error){
            console.log(error.message);
        }
    }
}

/**
 * This routine adjusts feature "dot" image 
 * sizes, depending on current zoom level
 */
function resizeDots() {
    let rawnum = .045 * currentZoom;
    let newscale = rawnum.toFixed(3)
    vfrMarker.setScale(newscale);
    mvfrMarker.setScale(newscale);
    lifrMarker.setScale(newscale);
    ifrMarker.setScale(newscale);
    tafMarker.setScale(newscale);
    airportMarker.setScale(newscale);
    heliportMarker.setScale(newscale);
}

/**
 * Tile source for animated weather
 */
animatedWxTileSource = new ol.source.TileWMS({
    attributions: ['Iowa State University'],
    url: settings.animatedwxurl,
    params: {'LAYERS': 'nexrad-n0r-wmst'},
});


/**
 * jQuery $get all layer tile data
 */
$.get(`${URL_GET_TILESETS}`, (data) => {
    let extent = ol.proj.transformExtent(viewextent, 'EPSG:4326', 'EPSG:3857')
    
    sectionalTileLayer = new ol.layer.Tile({
        title: "VFR Sectional Chart",
        type: "overlay", 
        source: new ol.source.XYZ({
            attributions: ["© <a href='https://www.openflightmaps.org'>openflightmaps.org</a>"],
            url: URL_GET_VFRSEC_TILE,
            maxZoom: 11,
            minZoom: 5,
            attributionsCollapsible: false
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });
    
    terminalTileLayer = new ol.layer.Tile({
        title: "Terminal Area Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_TERM_TILE,
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });
    
    helicopterTileLayer = new ol.layer.Tile({
        title: "Helicopter Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_HELI_TILE,
            maxZoom: 13,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    caribbeanTileLayer = new ol.layer.Tile({
        title: "Caribbean Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_CARIB_TILE,
            maxZoom: 11,
            minZoom: 5
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    grandcanyonAoTileLayer = new ol.layer.Tile({
        title: "Grand Canyon Air Ops",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCAO_TILE,
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    grandcanyonGaTileLayer = new ol.layer.Tile({
        title: "Grand Canyon GA",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCGA_TILE,  
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    debugTileLayer = new ol.layer.Tile({
        title: "Debug",
        type: "overlay",
        source: new ol.source.TileDebug(),
        visible: false,
        extent: extent,
        zIndex: 12
    });

    animatedWxTileLayer = new ol.layer.Tile({
        title: "Animated Weather",
        extent: extent,
        source: animatedWxTileSource,
        visible: false,
        zIndex: 11
    });

    if (settings.useOSMonlinemap) {
        osmTileLayer = new ol.layer.Tile({
            title: "Open Street Maps",
            type: "overlay",
            source: new ol.source.OSM(),
            visible: true,
            extent: extent,
            zIndex: 9
        });
    }

    metarVectorSource = new ol.source.Vector({
        features: metarFeatures
    });
    metarVectorLayer = new ol.layer.Vector({
        title: "Metars",
        source: metarVectorSource,
        visible: false,
        extent: extent,
        zIndex: 12
    }); 

    airportVectorSource = new ol.source.Vector({
        features: airportFeatures
    });
    airportVectorLayer = new ol.layer.Vector({
        title: "All Airports",
        source: airportVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 
    
    tafVectorSource = new ol.source.Vector({
        features: tafFeatures
    });
    tafVectorLayer = new ol.layer.Vector({
        title: "TAFs",
        source: tafVectorSource,
        visible: false,
        extent: extent,
        zIndex: 13
    });
    
    pirepVectorSource = new ol.source.Vector({
        features: pirepFeatures
    });
    pirepVectorLayer = new ol.layer.Vector({
        title: "Pireps",
        source: pirepVectorSource,
        visible: false,
        extent: extent, zIndex: 14
    });

    map.addLayer(debugTileLayer);
    map.addLayer(airportVectorLayer);
    map.addLayer(metarVectorLayer); 
    map.addLayer(tafVectorLayer);
    map.addLayer(pirepVectorLayer);
    map.addLayer(animatedWxTileLayer);
    map.addLayer(caribbeanTileLayer);
    map.addLayer(grandcanyonAoTileLayer);
    map.addLayer(grandcanyonGaTileLayer);
    map.addLayer(helicopterTileLayer);
    map.addLayer(terminalTileLayer);
    map.addLayer(sectionalTileLayer);

    if (settings.useOSMonlinemap) {
        map.addLayer(osmTileLayer);
    }

    let layerSwitcher = new ol.control.LayerSwitcher({
        tipLabel: 'Layers', 
        groupSelectStyle: 'children'
    });
    map.addControl(layerSwitcher);

    airportVectorLayer.on('change:visible', () => {
        let visible = airportVectorLayer.get('visible');
        regioncontrol.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
            regionselect.options[0].selected = true;
            regionselect.value = lastcriteria; 
            selectFeaturesByCriteria()
            popupcloser.onclick();
        }
    });

    animatedWxTileLayer.on('change:visible', () => {
        let visible = animatedWxTileLayer.get('visible');
        animatecontrol.style.visibility = visible ? 'visible' : 'hidden';
        visible ? playWeatherRadar() : stopWeatherRadar()
    });
});

/**
 * This allows a clicked feature to raise an event
 */
let select = null;
function selectStyle(feature) {
    console.log(`FEATURE: ${feature}`);
    return selected;
}

/**
 * If saving position history is enabled,  
 * save it at a specified time interval
 */
if (settings.putpositionhistory) {
    setInterval(putPositionHistory, settings.histintervalmsec);
}

/**
 * If using Stratux as a gps position source, 
 * get the data at a specified time interval
 */
if (settings.getgpsfromstratux) {
    setInterval(getGpsData, settings.gpsintervalmsec);
}

/**
 * For weather animation, gets the time 3 hours ago
 * @returns Date
 */
function getTimeThreeHoursAgo() {
    return new Date(Math.round(Date.now() / 3600000) * 3600000 - 3600000 * 3);
}

/**
 * For displaying the animation time clock
 */
function updateInfo() {
    const el = document.getElementById('info');
    el.innerHTML = getLocalTime(startDate.toString());
}

/**
 * Update the time clock  
 */
function setTime() {
    startDate.setMinutes(startDate.getMinutes() + 15);
    if (startDate > Date.now()) {
      startDate = getTimeThreeHoursAgo();
    }
    animatedWxTileSource.updateParams({'TIME': startDate.toISOString()});
    updateInfo();
}
setTime();

/**
 * Stop the weather radar animation
 */
const stopWeatherRadar = function () {
    if (animationId !== null) {
      window.clearInterval(animationId);
      animationId = null;
    }
};

/**
 * Start the weather radar animation
 */
const playWeatherRadar = function () {
    stop();
    animationId = window.setInterval(setTime, 1000 / frameRate);
};

/**
 * Animation start button element and event listener
 */
const startButton = document.getElementById('play');
startButton.addEventListener('click', playWeatherRadar, false);

/**
 * Animation stop button element and event listener
 */
const stopButton = document.getElementById('pause');
stopButton.addEventListener('click', stopWeatherRadar, false);

/**    fieldvalues.set(key, `<td>${subobj}</td>`);
            
 * Sets an initial time in the timeclock element
 */
updateInfo();

/**
 * Convert statute miles to desired unit 
 * @param {*} miles: statute miles
 * @returns statute miles, kilometers or nautical miles   
 */
 function getDistanceUnits(miles) {
    let num = parseFloat(miles);
    let label = "mi";
    switch (distanceunit) {
        case DistanceUnits.kilometers: 
            num = miles * 1.609344;
            label = "km"
            break;
        case DistanceUnits.nauticalmiles:
            num = miles * 0.8689762419;
            label = "nm";
            break;
    }
    return `${num.toFixed(1)} ${label}`;
}

/**
 * 
 * @param {*} temp: Temperature in Centigrade 
 * @returns Farenheit temperature fixed to 2 decimal places
 */
const convertCtoF = ((temp) => {
    if (temp == undefined) return "";
    let num = (temp * 9/5 + 32);
    if (num === NaN || num === undefined) return "";
    else return `${num.toFixed(1)} F°`;
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//      JSON output returned by websocket connected Stratux at ws://[ipaddress]/situation (AHRS data)
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// {"GPSLastFixSinceMidnightUTC":0,"GPSLatitude":0,"GPSLongitude":0,"GPSFixQuality":0,"GPSHeightAboveEllipsoid":0,"GPSGeoidSep":0,
//  "GPSSatellites":0,"GPSSatellitesTracked":0,"GPSSatellitesSeen":2,"GPSHorizontalAccuracy":999999,"GPSNACp":0,"GPSAltitudeMSL":0,
//  "GPSVerticalAccuracy":999999,"GPSVerticalSpeed":0,"GPSLastFixLocalTime":"0001-01-01T00:00:00Z","GPSTrueCourse":0,"GPSTurnRate":0,
//  "GPSGroundSpeed":0,"GPSLastGroundTrackTime":"0001-01-01T00:00:00Z","GPSTime":"0001-01-01T00:00:00Z",
//  "GPSLastGPSTimeStratuxTime":"0001-01-01T00:00:00Z","GPSLastValidNMEAMessageTime":"0001-01-01T00:01:33.5Z",
//  "GPSLastValidNMEAMessage":"$PUBX,00,000122.90,0000.00000,N,00000.00000,E,0.000,NF,5303302,3750001,0.000,0.redrawMetars00,0.000,,99.99,99.99,99.99,0,0,0*20",
//  "GPSPositionSampleRate":0,"BaroTemperature":22.1,"BaroPressureAltitude":262.4665,"BaroVerticalSpeed":-0.6568238,
//  "BaroLastMeasurementTime":"0001-01-01T00:01:33.52Z","AHRSPitch":-1.7250436907060false585,"AHRSRoll":1.086912223392926,
//  "AHRSGyroHeading":3276.7,"AHRSMagHeading":3276.7,"AHRSSlipSkid":-0.6697750324029778,"AHRSTurnRate":3276.7,
//  "AHRSGLoad":0.9825397416431592,"AHRSGLoadMin":0.9799488522426687,"AHRSGLoadMax":0.9828301105039375,
//  "AHRSLastAttitudeTime":"0001-01-01T00:01:33.55Z","AHRSStatus":6}
//
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let deg = 0;
let alt = 0;
let lng = 0;
let lat = 0;

/**
 * Get gps data from Stratux, updates current position
 * @returns statute miles, kilometers or nautical miles   
 * and orients the rotation of the ownship image
 */
function getGpsData() {
    $.get(settings.stratuxurl, function(data) {
        viewposition = ol.proj.fromLonLat([data.GPSLongitude, data.GPSLatitude]);
        if (data.GPSLongitude !== 0 && data.GPSLatitude !== 0) {
            myairplane.setOffset(offset);
            myairplane.setPosition(viewposition);
            lng = data.GPSLongitude;
            lat = data.GPSLatitude;
            alt = data.GPSAltitudeMSL;
            deg = parseInt(data.AHRSMagHeading / 10);
            airplaneElement.style.transform = "rotate(" + deg + "deg)";
        }
    });
}

/**
 * Save the position history in positionhistory.db
 */
function putPositionHistory() {
    if (last_longitude !== lng || last_latitude !== lat) {
        if (lng + lat + deg + alt > 0) {
            let postage = { longitude: lng, 
                latitude: lat, 
                heading: deg,
                altitude: Math.round(alt) };

            var xhr = new XMLHttpRequest();
            xhr.open("POST", URL_PUT_HISTORY);
            xhr.setRequestHeader("Content-Type", "application/json");
            try {    
                xhr.send(JSON.stringify(postage));
            }
            finally {}
        }
    }
}

/**
 * Utility function to replace all instances of a  
 * specified string with another specified string
 * @param {*} string: string to search 
 * @param {*} search: string to search FOR 
 * @param {*} replace: string to replace any found search 
 * @returns sring: the new string with replacements
 */
function replaceAll(string, search, replace) {
    return string.split(search).join(replace);
}

/**
 * This just makes a zulu date look nicer...
 * @param {*} zuludate 
 * @returns string: cleaned zulu date
 */
function formatZuluDate(zuludate) {
    let workstring = zuludate.split("T");
    let zstring = workstring[1].slice(0, -1);
    return  `${workstring[0]} ${zstring} Z`;
}

/**
 * Get the local machine dae/time from the supplied ZULU date
 * @param {*} zuludate: the ZULU date to be translated 
 * @returns string: the translated date in standard or daylight time
 */
 function getLocalTime(zuludate) {
    let date = new Date(zuludate);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let year = date.getFullYear();
    let tzone = "";

    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0'+minutes : minutes;

    let timex = date.toString().split("GMT");
    let time = timex[1];

    if (time.search("Eastern Standard") > -1) {
        tzone = "(EST)"; //time.replace("Eastern Standard Time", "EST");
    }
    if (time.search("Eastern Daylignt") > -1) {
        tzone = "(EDT)"; //time.replace("Eastern Standard Time", "EDT");
    }
    if (time.search("Central Standard") > -1) {
        tzone = "(CST)"; //time.replace("Central Standard Time", "CST");
    }
    if (time.search("Central Daylight") > -1) {
        tzone = "(CDT)"; //time.replace("Eastern Standard Time", "CDT");
    }
    if (time.search("Mountain Standard") > -1) {
        tzone = "(MST)"; //time.replace("Mountain Standard Time", "MST");
    }
    if (time.search("Mountain Daylight") > -1) {
        tzone = "(MDT)"; //time.replace("Eastern Standard Time", "MDT");
    }
    if (time.search("Pacific Standard") > -1) {
        tzone = "(PST)"; //time.replace("Pacific Standard Time", "PST");
    }
    if (time.search("Pacific Daylight") > -1) {
        tzone = "(PDT)"; //time.replace("Pacific Daylight Time", "PDT");
    }
    if (time.search("Alaska Standard") > -1) {
        tzone = "(AKST)"; //time.replace("Alaska Standard Time", "AKST");
    }
    if (time.search("Alaska Daylight") > -1) {
        tzone = "(AKDT)"; //time.replace("Alaska Daylight Time", "AKDT");
    }
    if (time.search("Atlantic Standard") > -1) {
        tzone = "(AST)"; //time.replace("Atlantic Standard Time", "AST");
    }
    if (time.search("Atlantic Daylight") > -1) {
        tzone = "(ADT)"; //time.replace("Atlantic Daylight Time", "ADT");
    }
    return `${month}-${day}-${year} ${hours}:${minutes} ${ampm} ${tzone}`;
}

/**
 * Utility function to trim and round Metar or TAF  
 * altimeter value to a standard fixed(2) number
 * @param {*} altimeter 
 * @returns 
 */
function getAltimeterSetting(altimeter) {
    let dbl = parseFloat(altimeter);
    return dbl.toFixed(2).toString();
}

/**
 * Get the formatted name of an airport
 * @param {string} ident, the airport identifier 
 * @returns string, formatted name of the airport
 */
 function getFormattedAirportName(ident) {
    let retvalue = airportNameKeymap.get(ident);
    if (retvalue === undefined || 
        retvalue === "undefined" ||
        retvalue === "") {
        retvalue = "";
    } 
    else {
        retvalue = retvalue.replace("/", "\n");
        retvalue = retvalue.replace(",", "\n");
    }
    return retvalue;
}

/**
 * Get the description for a TAF fieldname abbreviation
 * @param {string} fieldname 
 * @returns string, readable description of fieldname 
 */
 function getFieldDescription(fieldname) {
    let retvalue = fieldname;
    if (!Number.isInteger(fieldname)) {
        retvalue = tafFieldKeymap.get(fieldname);
        if (retvalue === undefined) {
            retvalue = fieldname;
        }
    }
    return retvalue;
}

/**
 * Load normalized TAF field names
 */
function loadTafFieldKeymap() {
    tafFieldKeymap.set("temp_c", "Temperature °C");
    tafFieldKeymap.set("icing_type", "Icing type");
    tafFieldKeymap.set("pirep_type", "Pirep type");
    tafFieldKeymap.set("altitude_ft_msl", "Altitude in feet MSL");
    tafFieldKeymap.set("receipt_time", "Receipt time")
    tafFieldKeymap.set("observation_time", "Observation time")
    tafFieldKeymap.set("latitude", "Latitude")
    tafFieldKeymap.set("longitude", "Longitude")
    tafFieldKeymap.set("cloud_type", "Cloud type");
    tafFieldKeymap.set("fcst_time_from", "Time from");
    tafFieldKeymap.set("fcst_time_to", "Time to");
    tafFieldKeymap.set("change_indicator", "Change indicator");
    tafFieldKeymap.set("time_becoming", "Time becoming");
    tafFieldKeymap.set("probability", "Probability");
    tafFieldKeymap.set("wind_dir_degrees", "Wind Direction");
    tafFieldKeymap.set("wind_speed_kt", "Wind Speed knots");
    tafFieldKeymap.set("wind_gust_kt", "Wind Gust knots");
    tafFieldKeymap.set("wind_shear_hgt_ft_agl", "Shear height feet AGL");
    tafFieldKeymap.set("wind_shear_dir_degrees", "Shear direction");
    tafFieldKeymap.set("wind_shear_speed_kt", "Shear speed knots");
    tafFieldKeymap.set("altim_in_hg", "Altimeter (Hg)");
    tafFieldKeymap.set("vert_vis_ft", "Vertical visibility in feet");
    tafFieldKeymap.set("visibility_statute_mi", "Horizontal visibility in statute miles");
    tafFieldKeymap.set("wx_string", "Weather");
    tafFieldKeymap.set("sky_condition", "Sky condition");
    tafFieldKeymap.set("icing_condition", "Icing condition");
    tafFieldKeymap.set("turbulence_condition", "Turbulence condition");
    tafFieldKeymap.set("sky_cover", "Sky cover");
    tafFieldKeymap.set("cloud_base_ft_agl", "Cloud base feet AGL");
    tafFieldKeymap.set("cloud_base_ft_msl", "Cloud base feet MSL");
    tafFieldKeymap.set("cloud_base", "Cloud base");
    // icing fieldnames
    tafFieldKeymap.set("icing_intensity", "Intensity");
    tafFieldKeymap.set("icing_min_alt_ft_agl", "Min altitude feet AGL");
    tafFieldKeymap.set("icing_max_alt_ft_agl", "Max altitude feet AGL");
    tafFieldKeymap.set("icing_min_alt_ft_msl", "Min altitude feet MSL");
    tafFieldKeymap.set("icing_max_alt_ft_agl", "Max altitude feet MSL");
    tafFieldKeymap.set("icing_type", "Type");
    tafFieldKeymap.set("icing_top_ft_msl", "Top in feet MSL");
    tafFieldKeymap.set("icing_base_ft_msl", "Base in feet MSL");
    // turbulence fieldnames
    tafFieldKeymap.set("turbulence_intensity", "Intensity");
    tafFieldKeymap.set("turbulence_min_alt_ft_agl", "Min altitude feet AGL");
    tafFieldKeymap.set("turbulence_max_alt_ft_agl", "Max altitude feet AGL");
    tafFieldKeymap.set("turbulence_freq", "Frequency");
    tafFieldKeymap.set("turbulence_type", "Type");
    tafFieldKeymap.set("turbulence_top_ft_msl", "Top in feet MSL");
    tafFieldKeymap.set("turbulence_base_ft_msl", "Base in feet MSL");
}

/**
 * Get the description for a TAF/Metar fieldname abbreviation
 * @param {string} fieldname 
 * @returns string, readable description of fieldname 
 */
 function getMetarFieldDescription(fieldname) {
    let retvalue = metarFieldKeymap.get(fieldname);
    if (retvalue === undefined || retvalue === "") {
        retvalue = replaceAll(fieldname, "_", " ");
    }
    return retvalue;
}
/**
 * Load normalized metar field names
 */
 function loadMetarFieldKeymap() {
    metarFieldKeymap.set("raw_text", "raw text");
    metarFieldKeymap.set("station_id", "station id"); 
    metarFieldKeymap.set("observation_time", "Observation Time");
    metarFieldKeymap.set("latitude", "latitude");
    metarFieldKeymap.set("longitude", "longitude");
    metarFieldKeymap.set("temp_c", "Temp °C");
    metarFieldKeymap.set("dewpoint_c", "Dewpoint °C");
    metarFieldKeymap.set("wind_dir_degrees", "Wind direction"); 
    metarFieldKeymap.set("wind_speed_kt", "Wind speed knots");
    metarFieldKeymap.set("wind_gust_kt", "Wind gust knots");
    metarFieldKeymap.set("visibility_statute_mi", "Horizontal visibility in statute miles");
    metarFieldKeymap.set("altim_in_hg", "Altimeter in Hg");
    metarFieldKeymap.set("sea_level_pressure_mb", "Sea-level pressure in MB");
    metarFieldKeymap.set("quality_control_flags", "Quality control flags");
    metarFieldKeymap.set("wx_string", "Weather");
    metarFieldKeymap.set("sky_condition", "Sky cover");
    metarFieldKeymap.set("sky_cover", "Sky cover");
    metarFieldKeymap.set("cloud_base_ft_agl", "Cloud base feet AGL");
    metarFieldKeymap.set("cloud_base", "Cloud base");
    metarFieldKeymap.set("flight_category", "Flight category");
    metarFieldKeymap.set("three_hr_pressure_tendency_mb", "Pressure change past 3 hours in MB");
    metarFieldKeymap.set("maxT_c", "Max air temp °C, past 6 hours");
    metarFieldKeymap.set("minT_c", "Min air temp °C, past 6 hours");
    metarFieldKeymap.set("maxT24hr_c", "Max air temp °C, past 24 hours");
    metarFieldKeymap.set("minT24hr_c", "Min air temp °C, past 24 hours");
    metarFieldKeymap.set("precip_in", "Liquid precipitation since last METAR");
    metarFieldKeymap.set("pcp3hr_in", "Liquid precipitation past 3 hours");
    metarFieldKeymap.set("pcp6hr_in", "Liquid precipitation past 6 hours");
    metarFieldKeymap.set("pcp24hr_in", "Liquid precipitation past 24 hours");
    metarFieldKeymap.set("snow_in", "Snow depth in inches");
    metarFieldKeymap.set("vert_vis_ft", "Vertical visibility in feet");
    metarFieldKeymap.set("metar_type", "Metar type");
    metarFieldKeymap.set("elevation_m", "Station elevation in meters");
}

/**
 * Get the description for a TAF/Metar weather acronym
 * @param {string} acronym 
 * @returns string, readable description of acronym 
 */
function getWeatherAcronymDescription(acronym) {
    let retvalue = weatherAcronymKeymap.get(acronym);
    if (retvalue === undefined) retvalue = acronym;
    return retvalue;
}
/**
 * Load the wxkeymap Map object with weather code descriptions
 */
function loadWeatherAcronymKeymap() {
    weatherAcronymKeymap.set("FU", "Smoke");
    weatherAcronymKeymap.set("VA", "Volcanic Ash");
    weatherAcronymKeymap.set("HZ", "Haze");
    weatherAcronymKeymap.set("DU", "Dust");
    weatherAcronymKeymap.set("SA", "Sand");
    weatherAcronymKeymap.set("BLDU", "Blowing dust");
    weatherAcronymKeymap.set("BLSA", "Blowing sand");
    weatherAcronymKeymap.set("PO", "Dust devil");
    weatherAcronymKeymap.set("VCSS", "Vicinity sand storm");
    weatherAcronymKeymap.set("BR", "Mist or light fog");
    weatherAcronymKeymap.set("MIFG", "More or less continuous shallow fog");
    weatherAcronymKeymap.set("VCTS", "Vicinity thunderstorm");
    weatherAcronymKeymap.set("VIRGA", "Virga or precipitation not hitting ground");
    weatherAcronymKeymap.set("VCSH", "Vicinity showers");
    weatherAcronymKeymap.set("TS", "Thunderstorm with or without precipitation");
    weatherAcronymKeymap.set("SQ", "Squalls");
    weatherAcronymKeymap.set("FC", "Funnel cloud or tornado");
    weatherAcronymKeymap.set("SS", "Sand or dust storm");
    weatherAcronymKeymap.set("+SS", "Strong sand or dust storm");
    weatherAcronymKeymap.set("BLSN", "Blowing snow");
    weatherAcronymKeymap.set("DRSN", "Drifting snow");
    weatherAcronymKeymap.set("VCFG", "Vicinity fog");
    weatherAcronymKeymap.set("BCFG", "Patchy fog");
    weatherAcronymKeymap.set("PRFG", "Fog, sky discernable");
    weatherAcronymKeymap.set("FG", "Fog, sky undiscernable");
    weatherAcronymKeymap.set("FZFG", "Freezing fog");
    weatherAcronymKeymap.set("-DZ", "Light drizzle");
    weatherAcronymKeymap.set("DZ", "Moderate drizzle");
    weatherAcronymKeymap.set("+DZ", "Heavy drizzle");
    weatherAcronymKeymap.set("-FZDZ", "Light freezing drizzle");
    weatherAcronymKeymap.set("FZDZ", "Moderate freezing drizzle");
    weatherAcronymKeymap.set("+FZDZ", "Heavy freezing drizzle");
    weatherAcronymKeymap.set("-DZRA", "Light drizzle and rain");
    weatherAcronymKeymap.set("DZRA", "Moderate to heavy drizzle and rain");
    weatherAcronymKeymap.set("-RA", "Light rain");
    weatherAcronymKeymap.set("RA", "Moderate rain");
    weatherAcronymKeymap.set("+RA", "Heavy rain");
    weatherAcronymKeymap.set("-FZRA", "Light freezing rain");
    weatherAcronymKeymap.set("FZRA", "Moderate freezing rain");
    weatherAcronymKeymap.set("+FZRA", "Heavy freezing rain");
    weatherAcronymKeymap.set("-RASN", "Light rain and snow");
    weatherAcronymKeymap.set("RASN", "Moderate rain and snow");
    weatherAcronymKeymap.set("+RASN", "Heavy rain and snow");
    weatherAcronymKeymap.set("-SN", "Light snow");
    weatherAcronymKeymap.set("SN", "Moderate snow");
    weatherAcronymKeymap.set("+SN", "Heavy snow");
    weatherAcronymKeymap.set("SG", "Snow grains");
    weatherAcronymKeymap.set("IC", "Ice crystals");
    weatherAcronymKeymap.set("PE PL", "Ice pellets");
    weatherAcronymKeymap.set("PE", "Ice pellets");
    weatherAcronymKeymap.set("PL", "Ice pellets");
    weatherAcronymKeymap.set("-SHRA", "Light rain showers");
    weatherAcronymKeymap.set("SHRA", "Moderate rain showers");
    weatherAcronymKeymap.set("+SHRA", "Heavy rain showers");
    weatherAcronymKeymap.set("-SHRASN", "Light rain and snow showers");
    weatherAcronymKeymap.set("SHRASN", "Moderate rain and snow showers");
    weatherAcronymKeymap.set("+SHRASN", "Heavy rain and snow showers");
    weatherAcronymKeymap.set("-SHSN", "Light snow showers");
    weatherAcronymKeymap.set("SHSN", "Moderate snow showers");
    weatherAcronymKeymap.set("+SHSN", "Heavy snow showers");
    weatherAcronymKeymap.set("-GR", "Light showers with hail, not with thunder");
    weatherAcronymKeymap.set("GR", "Moderate to heavy showers with hail, not with thunder");
    weatherAcronymKeymap.set("TSRA", "Light to moderate thunderstorm with rain");
    weatherAcronymKeymap.set("TSGR", "Light to moderate thunderstorm with hail");
    weatherAcronymKeymap.set("+TSRA", "Thunderstorm with heavy rain");
    weatherAcronymKeymap.set("UP", "Unknown precipitation");
    weatherAcronymKeymap.set("NSW", "No significant weather");
}

/**
 * Get the description for a sky condition acronym
 * @param {string} acronym 
 * @returns acronym if found, otherwise just returns key
 */
function getSkyConditionDescription(acronym) {
    let retvalue = skyConditionKeymap.get(acronym);
    if (retvalue === undefined) {
        retvalue = acronym;
    }
    return retvalue;
}
/**
 * Map containing standard TAF/Metar acronyms
 */
 function loadSkyConditionmKeymap() {
    skyConditionKeymap.set("BKN", "Broken");
    skyConditionKeymap.set("BECMG", "Becoming");
    skyConditionKeymap.set("CB", "Cumulo-Nimbus");
    skyConditionKeymap.set("IMC", "Instrument meteorological conditions"),
    skyConditionKeymap.set("IMPR", "Improving");
    skyConditionKeymap.set("INC", "In Clouds");
    skyConditionKeymap.set("INS", "Inches");
    skyConditionKeymap.set("INTER", "Intermittent");
    skyConditionKeymap.set("INTSF", "Intensify(ing)");
    skyConditionKeymap.set("INTST", "Intensity");
    skyConditionKeymap.set("JTST", "Jet stream");
    skyConditionKeymap.set("KM", "Kilometers");
    skyConditionKeymap.set("KMH", "Kilometers per hour");
    skyConditionKeymap.set("KT", "Knots");
    skyConditionKeymap.set("L", "Low pressure area");
    skyConditionKeymap.set("LAN", "Land");
    skyConditionKeymap.set("LDA", "Landing distance available");
    skyConditionKeymap.set("LDG", "Landing");
    skyConditionKeymap.set("LGT", "Light");
    skyConditionKeymap.set("LOC", "Locally");
    skyConditionKeymap.set("LSQ", "Line squall");
    skyConditionKeymap.set("LSR", "Loose snow on runway");
    skyConditionKeymap.set("LTG", "Lightning");
    skyConditionKeymap.set("LYR", "Layer");
    skyConditionKeymap.set("M", "Meters");
    skyConditionKeymap.set("M", "Minus or below zero");
    skyConditionKeymap.set("M", "Less than lowest reportable sensor value");
    skyConditionKeymap.set("MAX", "Maximum");
    skyConditionKeymap.set("MB", "Millibars");
    skyConditionKeymap.set("MET", "Meteorological");
    skyConditionKeymap.set("MI", "Shallow");
    skyConditionKeymap.set("MIN", "Minutes");
    skyConditionKeymap.set("MNM", "Minimum");
    skyConditionKeymap.set("MOD", "Moderate");
    skyConditionKeymap.set("MOV", "Move, moving");
    skyConditionKeymap.set("MPS", "Meters per second");
    skyConditionKeymap.set("MS", "Minus");
    skyConditionKeymap.set("MSL", "Mean sea level");
    skyConditionKeymap.set("MTW", "Mountain waves");
    skyConditionKeymap.set("MU", "Runway friction coefficent");
    skyConditionKeymap.set("NC", "No change");
    skyConditionKeymap.set("NIL", "None, nothing");
    skyConditionKeymap.set("NM", "Nautical mile(s)");
    skyConditionKeymap.set("NMRS", "Numerous");
    skyConditionKeymap.set("NO", "Not available");
    skyConditionKeymap.set("NOSIG", "No significant change");
    skyConditionKeymap.set("NS", "Nimbostratus");
    skyConditionKeymap.set("NSC", "No significant clouds");
    skyConditionKeymap.set("NSW", "No Significant Weather");
    skyConditionKeymap.set("OBS", "Observation");
    skyConditionKeymap.set("OBSC", "Obscuring");
    skyConditionKeymap.set("OCNL", "Occasional");
    skyConditionKeymap.set("OKTA", "Eight of sky cover");
    skyConditionKeymap.set("OTP", "On top");
    skyConditionKeymap.set("OTS", "Out of service");
    skyConditionKeymap.set("OVC", "Overcast");
    skyConditionKeymap.set("P", "Greater than highest reportable sensor value");
    skyConditionKeymap.set("P6SM", "Visibility greater than 6 SM");
    skyConditionKeymap.set("PAEW", "Personnel and equipment working");
    skyConditionKeymap.set("PE", "Ice Pellets");
    skyConditionKeymap.set("PJE", "Parachute Jumping Exercise");
    skyConditionKeymap.set("PK WND", "Peak wind");
    skyConditionKeymap.set("PLW", "Plow/plowed");
    skyConditionKeymap.set("PNO", "Precipitation amount not available");
    skyConditionKeymap.set("PO", "Dust/Sand Whirls");
    skyConditionKeymap.set("PPR", "Prior permission required");
    skyConditionKeymap.set("PR", "Partial");
    skyConditionKeymap.set("PRESFR", "Pressure falling rapidly");
    skyConditionKeymap.set("PRESRR", "Pressure rising rapidly");
    skyConditionKeymap.set("PROB", "Probability");
    skyConditionKeymap.set("PROB30", "Probability 30 percent");
    skyConditionKeymap.set("PS", "Plus");
    skyConditionKeymap.set("PSR", "Packed snow on runway");
    skyConditionKeymap.set("PWINO", "Precipitation id sensor not available");
    skyConditionKeymap.set("PY", "Spray");
    skyConditionKeymap.set("R", "Runway (in RVR measurement)");
    skyConditionKeymap.set("RA", "Rain");
    skyConditionKeymap.set("RAB", "Rain Began");
    skyConditionKeymap.set("RADAT", "Radiosonde observation addl data");
    skyConditionKeymap.set("RAE", "Rain Ended");
    skyConditionKeymap.set("RAPID", "Rapid(ly)");
    skyConditionKeymap.set("RASN", "Rain and snow");
    skyConditionKeymap.set("RCAG", "Remote Center Air/Ground Comm Facility");
    skyConditionKeymap.set("RMK", "Remark");
    skyConditionKeymap.set("RVR", "Runway visual range");
    skyConditionKeymap.set("RVRNO", "RVR not available");
    skyConditionKeymap.set("RY/RWY", "Runway");
    skyConditionKeymap.set("SA", "Sand");
    skyConditionKeymap.set("SAND", "Sandstorm");
    skyConditionKeymap.set("SC", "Stratocumulus");
    skyConditionKeymap.set("SCSL", "Stratocumulus standing lenticular cloud");
    skyConditionKeymap.set("SCT", "Scattered cloud coverage");
    skyConditionKeymap.set("SEC", "Seconds");
    skyConditionKeymap.set("SEV", "Severe");
    skyConditionKeymap.set("SFC", "Surface");
    skyConditionKeymap.set("SG", "Snow Grains");
    skyConditionKeymap.set("SH", "Shower");
    skyConditionKeymap.set("SHWR", "Shower");
    skyConditionKeymap.set("SIGMET", "Information from MWO");
    skyConditionKeymap.set("SIR", "Snow and ice on runway");
    skyConditionKeymap.set("SKC", "Sky Clear");
    skyConditionKeymap.set("SLP", "Sea Level Pressure in MB");
    skyConditionKeymap.set("SLPNO", "Sea-level pressure not available");
    skyConditionKeymap.set("SLR", "Slush on runway");
    skyConditionKeymap.set("SLW", "Slow");
    skyConditionKeymap.set("SM", "Statute Miles");
    skyConditionKeymap.set("SMK", "Smoke");
    skyConditionKeymap.set("SMO", "Supplementary meteorological office");
    skyConditionKeymap.set("SN", "Snow");
    skyConditionKeymap.set("SPECI", "Special Report");
    skyConditionKeymap.set("SQ", "Squall");
    skyConditionKeymap.set("SS", "Sandstorm");
    skyConditionKeymap.set("SSR", "Secondary Surveillance Radar");
    skyConditionKeymap.set("T", "Temperature");
    skyConditionKeymap.set("TAF", "Terminal aerodrome forecast in code");
    skyConditionKeymap.set("TAPLEY", "Tapley runway friction coefficient");
    skyConditionKeymap.set("TAR", "Terminal Area Surveillance Radar");
    skyConditionKeymap.set("TAIL", "Tail wind");
    skyConditionKeymap.set("TCH", "Threshold Crossing Height");
    skyConditionKeymap.set("TCU", "Towering Cumulus");
    skyConditionKeymap.set("TDO", "Tornado");
    skyConditionKeymap.set("TDWR", "Terminal Doppler Weather Radar");
    skyConditionKeymap.set("TEMPO", "TEMPO");
    skyConditionKeymap.set("TEND", "Trend or tending to");
    skyConditionKeymap.set("TKOF", "Takeoff");
    skyConditionKeymap.set("TMPA", "Traffic Management Program Alert");
    skyConditionKeymap.set("TODA", "Takeoff distance available");
    skyConditionKeymap.set("TOP", "Cloud top");
    skyConditionKeymap.set("TORA", "Takeoff run available");
    skyConditionKeymap.set("TS", "Thunderstorm");
    skyConditionKeymap.set("TSNO", "Thunderstorm/lightning detector not available");
    skyConditionKeymap.set("TURB", "Turbulence");
    skyConditionKeymap.set("TWY", "Taxiway");
    skyConditionKeymap.set("UFN", "Until further notice");
    skyConditionKeymap.set("UNL", "Unlimited");
    skyConditionKeymap.set("UP", "Unknown Precipitation");
    skyConditionKeymap.set("UTC", "Coordinated Universal Time (=GMT)");
    skyConditionKeymap.set("V", "Variable (wind direction and RVR)");
    skyConditionKeymap.set("VA", "Volcanic Ash");
    skyConditionKeymap.set("VC", "Vicinity");
    skyConditionKeymap.set("VER", "Vertical");
    skyConditionKeymap.set("VFR", "Visual flight rules");
    skyConditionKeymap.set("VGSI", "Visual Glide Slope Indicator");
    skyConditionKeymap.set("VIS", "Visibility");
    skyConditionKeymap.set("VISNO [LOC]", "Visibility Indicator at second location not available");
    skyConditionKeymap.set("VMS", "Visual meteorological conditions");
    skyConditionKeymap.set("VOLMET", "Meteorological information for aircraft in flight");
    skyConditionKeymap.set("VRB", "Variable wind direction");
    skyConditionKeymap.set("VRBL", "Variable");
    skyConditionKeymap.set("VSP", "Vertical speed");
    skyConditionKeymap.set("VV", "Vertical Visibility (indefinite ceiling)");
    skyConditionKeymap.set("WAAS", "Wide Area Augmentation System");
    skyConditionKeymap.set("WDSPR", "Widespread");
    skyConditionKeymap.set("WEF", "With effect from");
    skyConditionKeymap.set("WIE", "With immediate effect");
    skyConditionKeymap.set("WIP", "Work in progress");
    skyConditionKeymap.set("WKN", "Weaken(ing)");
    skyConditionKeymap.set("WR", "Wet runway");
    skyConditionKeymap.set("WS", "Wind shear");
    skyConditionKeymap.set("WSHFT", "Wind shift (in minutes after the hour)");
    skyConditionKeymap.set("WSP", "Weather Systems Processor");
    skyConditionKeymap.set("WSR", "Wet snow on runway");
    skyConditionKeymap.set("WST", "Convective Significant Meteorological Information");
    skyConditionKeymap.set("WTSPT", "Waterspout");
    skyConditionKeymap.set("WW", "Severe Weather Watch Bulletin");
    skyConditionKeymap.set("WX", "Weather");
}

/**
 * Decode weather codes from TAFs or METARS
 * @param {*} codevalue: this could contain multiple space-delimited codes
 * @returns string with any weather description(s)
 */
 function decodeWxDescriptions(codevalue) {
    let outstr = "";
    let vals = codevalue.split(" ");
    
    for (let i = 0; i < vals.length; i++) {
        if (i === 0) {
            outstr = weatherAcronymKeymap.get(vals[i]);
        }
        else {
            outstr += ` / ${weatherAcronymKeymap.get(vals[i])}`;
        }
    }
    return outstr;
}

/**
 * Get the description for an icing code
 * @param {string} code 
 * @returns string, readable description of code 
 */
 function getIcingCodeDescription(code) {
    let retvalue = icingCodeKeymap.get(code);
    if (retvalue === undefined) retvalue = code;
    return retvalue;
}
/**
 * Load readable descriptions for Icing codes
 */
function loadIcingCodeKeymap() {
    icingCodeKeymap.set("0", "None");
    icingCodeKeymap.set("1", "Light");
    icingCodeKeymap.set("2", "Light in clouds")
    icingCodeKeymap.set("3", "Light in precipitation")
    icingCodeKeymap.set("4", "Moderate");   
    icingCodeKeymap.set("5", "Moderate in clouds");
    icingCodeKeymap.set("6", "Moderate in precipitation");
    icingCodeKeymap.set("7", "Severe");
    icingCodeKeymap.set("8", "Severe in clouds");
    icingCodeKeymap.set("9", "Severe in precipitation");     
}

/**
 * Get the description for a turbulence code
 * @param {string} code 
 * @returns string, readable description of code 
 */
 function getTurbulenceCodeDescription(code) {
    let retvalue = turbulenceCodeKeymap.get(code);
    if (retvalue === undefined) retvalue = code;
    return retvalue;
}
/**
 * Load readable descriptions for Turbulence codes
 */
function loadTurbulenceCodeKeymap() {
    turbulenceCodeKeymap.set("0", "Light");
    turbulenceCodeKeymap.set("1", "Light");
    turbulenceCodeKeymap.set("2", "Moderate in clean air occasionally")
    turbulenceCodeKeymap.set("3", "Moderate in clean air frequent");
    turbulenceCodeKeymap.set("4", "Moderate in clouds occasionally");   
    turbulenceCodeKeymap.set("5", "Moderate in clouds frequently");
    turbulenceCodeKeymap.set("6", "Severe in clean air occasionally");
    turbulenceCodeKeymap.set("7", "Severe in clean air frequent");
    turbulenceCodeKeymap.set("8", "Severe in clouds occasionally");
    turbulenceCodeKeymap.set("9", "Severe in clouds frequently");
    turbulenceCodeKeymap.set("X", "Extreme");
    turbulenceCodeKeymap.set("x", "Extreme");
}