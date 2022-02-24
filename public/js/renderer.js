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
let tafFieldKeymap = new Map();
let metarFieldKeymap = new Map();
let wxCodeKeymap = new Map();

loadTafFieldKeymap();
loadMetarFieldKeymap();
loadWxCodeKeymap();

/**
 * ol.Collections hold features like
 * metars, tafs, airport info, etc.
 */
let metarFeatures = new ol.Collection();
let airportFeatures = new ol.Collection();
let tafFeatures = new ol.Collection();

/**
 * Vector sources
 */
let metarVectorSource;
let airportVectorSource;
let tafVectorSource;
let ownshipVectorSource;
let animatedWxTileSource;

/**
 * Vector layers
 */
let airportVectorLayer;
let metarVectorLayer;
let tafVectorLayer;

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
                    loadAirportsCollection(payload);
                    break;
                case MessageTypes.metars.type:
                    processMetars(payload);
                    break;
                case MessageTypes.tafs.type:
                    processTafs(payload);
                    break;
                case MessageTypes.pireps.type:
                    //console.log(message.payload);
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
 * Icon markers for different weather/airport categories 
 */
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
/*--------------------------------------*/
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
 * @param {*} jsonobj: JSON object 
 */
function loadAirportsCollection(jsonobj) {
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let isoregion = airport.isoregion.replace("US-", "");
            regionmap.set(isoregion, isoregion);
            let airportmarker = new ol.Feature({
                ident: airport.ident,
                type: airport.type,
                name: airport.name,
                isoregion: isoregion,
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
        }

        /**
         * This is for the region select dropdown list
         * Map sort all region airports in alpha order by state/country
         */
        regionmap[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        regionmap.forEach((region) => { 
            let option = document.createElement("option");
            option.value = region;
            option.text = region;
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
        let isoregion = feature.get("isoregion");
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
        else if (isoregion !== lastcriteria && lastcriteria !== "allregions") {
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
                createMetarPopup(feature);
            }
            else if (datatype === "taf"){
                createTafPopup(feature);
            }
            else { // simple airport marker
                createAirportPopup(feature);
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
 * @param {*} feature: the metar the user clicked on 
 */
function createMetarPopup(feature) {
    let thismetar = feature.get("metar");
    let ident = thismetar.station_id;
    let cat = thismetar.flight_category;
    if (cat == undefined || cat == "undefined"){
        cat = "VFR";
    }
    let time = thismetar.observation_time;
    if (settings.uselocaltimeformetars) {
        time = getLocalTimeZone(time);
    }
    let tempC = thismetar.temp_c;
    let dewpC = thismetar.dewpoint_c;
    let temp = convertCtoF(thismetar.temp_c);
    let dewp = convertCtoF(thismetar.dewpoint_c);
    let windir = thismetar.wind_dir_degrees;
    let winspd = thismetar.wind_speed_kt + "";
    let wingst = thismetar.wind_gust_kt + ""; 
    let altim = getAltimeterSetting(thismetar.altim_in_hg);
    let vis = getDistanceUnits(thismetar.visibility_statute_mi);
    let wxcode = thismetar.wx_string !== undefined ? decodeWxDescriptions(thismetar.wx_string) : "";
    let skyconditions = decodeSkyCondition(thismetar.sky_condition);
    let icingconditions = decodeIcingCondition(thismetar.icing_condition);

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
        let name = ""
        try {
            name = airportVectorSource.getFeatureById(ident).get("name") + ", ";
        }
        catch(error) {
            console.log("Airport name NOT FOUND!");
        }
        let html = `<div id="#featurepopup"><pre><code><p>`
        html +=    `${css}&nbsp&nbsp${name}${ident} - ${cat}&nbsp&nbsp</label><p></p>`;
        html +=   (time != "" && time != "undefined") ? `Time:&nbsp<b>${time}</b><br/>` : "";
        html +=   (temp != "" && temp != "undefined") ? `Temp:&nbsp<b>${tempC} °C</b> (${temp})<br/>` : "";
        html +=   (dewp != "" && dewp != "undefined") ?`Dewpoint:&nbsp<b>${dewpC} °C</b> (${dewp})<br/>` : "";
        html += (windir != "" && windir != "undefined") ? `Wind Dir:&nbsp<b>${windir}°</b><br/>` : "";
        html += (winspd != "" && winspd != "undefined") ? `Wind Speed:&nbsp<b>${winspd}&nbspkt</b><br/>` : "";
        html += (wingst != "" && wingst != "undefined") ? `Wind Gust:&nbsp<b>${wingst}&nbspkt</b><br/>` : "";
        html +=  (altim != "" && altim != "undefined") ? `Altimeter:&nbsp<b>${altim}&nbsphg</b><br/>` : "";
        html +=    (vis != "" && vis != "undefined") ? `Visibility:&nbsp<b>${vis}</b><br/>` : "";
        html += (wxcode != "" && wxcode != "undefined") ? `Weather:&nbsp<b>${wxcode}</b><br/>`: "";
        html += (skyconditions != "" && skyconditions != "undefined") ? `${skyconditions}` : "";
        html += `</p></code></pre><br /></div>`;
        popupcloser.style.left = "30px";
        popupcloser.style.top = "88%";
        popupcontent.innerHTML = html;  
    }
}

/**
 * Create the html for a TAF popup element
 * @param {*} feature: the taf the user clicked on
 */
function createTafPopup(feature) {
    let thistaf = feature.get("taf");
    let forecast = thistaf.forecast;
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

    Object.values(forecast).forEach((value) => {
        html += "<p>";
        let fromto = `<label class="tafsubheader">`;
        Object.keys(value).forEach((key) => {
            let subobj = value[key];
            let fieldname = tafFieldKeymap.get(key);
            switch (key) {
                case "fcst_time_from":
                    fromto += `<b>${subobj}</b>`;
                    break;
                case "fcst_time_to":
                    fromto += `&nbsp&nbspto&nbsp&nbsp<b>${subobj}</b></label><br />`
                    html += `<label class="fcstlabel">${fromto}</label><br />`;
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
                    if (key === "wx_string") {
                        let lineval = decodeWxDescriptions(subobj);
                        html += `<label class="tafwxlabel">${fieldname}: <b>${lineval}</b></label><br />`;
                    }
                    else {
                        html += `<label class="taflabel">${fieldname}: <b>${subobj}</b></label><br />`;
                    }
                    break;
                case "sky_condition":
                    html += `<label class="tafskyheader">${fieldname}</label><br />`;
                    html += decodeSkyCondition(subobj);
                    break;
                case "turbulence_condition":
                case "icing_condition":
                    html += `<label class="tafskyheader">${fieldname}</label><br />`;
                    html += decodeIcingCondition(subobj);
                    break;
                case "temperature":
                    break;

            }
        });
        html += "</p><hr>";
    });
    html += "</div>";
    html = outerhtml.replace("###", html);
    popupcloser.style.left = "30px";
    popupcloser.style.top = "94%";
    popupcontent.innerHTML = html;
}

function decodeSkyCondition(skyjson) {
    let html = "";
    if (skyjson !== undefined) {
        let ovals = Object.values(skyjson);
        let okeys = Object.keys(skyjson);
        let keycount = -1;
        try {
            Object.values(skyjson).forEach((condition) => {
                let cleankey = "";
                let sublabel = "";
                if (typeof(condition) !== "string") {
                    Object.keys(condition).forEach((conditionkey) => {
                        cleankey = metarFieldKeymap.get(conditionkey);
                        if (cleankey === undefined || cleankey === "") {
                            cleankey = replaceAll(conditionkey, "_", " ");
                        }
                        sublabel = `<label class="taflabel">${cleankey}: <b>${condition[conditionkey]}</b></label><br />`;
                        html += sublabel;
                    });
                }
                else {
                    keycount ++;
                    cleankey = metarFieldKeymap.get(okeys[keycount]);
                    if (cleankey === undefined || cleankey === "") {
                        cleankey = replaceAll(okeys[keycount], "_", " ");
                    }
                    sublabel = `<label class="taflabel">${cleankey}: <b>${ovals[keycount]}</b></label><br />`;
                    html += sublabel;
                }
            });
        }
        catch (error) {
            console.log(error.message);
        }
    }
    return html;
}

function decodeIcingCondition(icingjson) {
    let html = "";
    if (icingjson != undefined) {
        try {
            Object.values(icingjson).forEach((condition) => {
                Object.keys(icingjson).forEach((condkey) => {
                    let sublabel = `<label class="taflabel">${replaceAll(condkey, "_", " ")}: <b>${condition}</b></label><br />`;
                    html += sublabel;
                });
            });
        }
        catch (error) {
            console.log(error.message);
        }
    }
    return html;        
}
/**
 * Build the html for an airport feature
 * @param {*} feature: the airport the user clicked on 
 */
function createAirportPopup(feature) {
    let ident = feature.get("ident");
    let name = ""
    try {
        name = airportVectorSource.getFeatureById(ident).get("name") + ", ";
    }
    catch(error) {
        console.log("Airport name NOT FOUND!");
    }
    let html = `<div id="#featurepopup"><pre><code><p>`;
        html += `&nbsp&nbsp${ident}&nbsp&nbsp</label><p></p>`;
        html += `</p></code></pre></div>`;
        popupcontent.innerHTML = html;  
}

/**
 * 
 * @param {*} metarsobject: JSON object with LOTS of metars
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
 * @param {*} tafsobject: JSON object with LOTS of tafs 
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
        zIndex: 11
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
        zIndex: 10
    });
    
    map.addLayer(debugTileLayer);
    map.addLayer(airportVectorLayer);
    map.addLayer(metarVectorLayer); 
    map.addLayer(tafVectorLayer);
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
    el.innerHTML = getLocalTimeZone(startDate.toString());
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
 * Get the local machine dae/time from the supplied ZULU date
 * @param {*} zuludate: the ZULU date to be translated 
 * @returns string: the translated date in standard or daylight time
 */
function getLocalTimeZone(zuludate) {
    let date = new Date(zuludate);
    let time = date.toString();
    let retval = time;
    if (time.search("Eastern Standard") > -1) {
        retval = time.replace("Eastern Standard Time", "EST");
        return retval;
    }
    if (time.search("Eastern Daylignt") > -1) {
        retval = time.replace("Eastern Standard Time", "EDT");
        return retval;
    }
    if (time.search("Central Standard") > -1) {
        retval = time.replace("Central Standard Time", "CST");
        return retval;
    }
    if (time.search("Central Daylight") > -1) {
        retval = time.replace("Eastern Standard Time", "CDT");
        return retval;
    }
    if (time.search("Mountain Standard") > -1) {
        retval = time.replace("Mountain Standard Time", "MST");
        return retval;
    }
    if (time.search("Mountain Daylight") > -1) {
        retval = time.replace("Eastern Standard Time", "MDT");
        return retval;
    }
    if (time.search("Pacific Standard") > -1) {
        retval = time.replace("Pacific Standard Time", "PST");
        return retval;wxupdateintervalmsec
    }
    if (time.search("Pacific Daylight") > -1) {
        retval = time.replace("Pacific Daylight Time", "PDT");
        return retval;
    }
    if (time.search("Alaska Standard") > -1) {
        retval = time.replace("Alaska Standard Time", "AKST");
        return retval;
    }
    if (time.search("Alaska Daylight") > -1) {
        retval = time.replace("Alaska Daylight Time", "AKDT");
        return retval;
    }
    if (time.search("Atlantic Standard") > -1) {
        retval = time.replace("Atlantic Standard Time", "AST");
        return retval;
    }
    if (time.search("Atlantic Daylight") > -1) {
        retval = time.replace("Atlantic Daylight Time", "ADT");
        return retval;
    }
    return retval;
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
 * Load taf normalized field names
 */
function loadTafFieldKeymap() {
    tafFieldKeymap.set("fcst_time_from", "Time from");
    tafFieldKeymap.set("fcst_time_to", "Time to");
    tafFieldKeymap.set("change_indicator", "Change indicator");
    tafFieldKeymap.set("time_becoming", "Time becoming");
    tafFieldKeymap.set("probability", "Probability");
    tafFieldKeymap.set("wind_dir_degrees", "Wind Direction °");
    tafFieldKeymap.set("wind_speed_kt", "Wind Speed kt");
    tafFieldKeymap.set("wind_gust_kt", "Wind Gust kt");
    tafFieldKeymap.set("wind_shear_hgt_ft_agl", "Shear height ft agl");
    tafFieldKeymap.set("wind_shear_dir_degrees", "Shear direction °");
    tafFieldKeymap.set("wind_shear_speed_kt", "Shear speed kt");
    tafFieldKeymap.set("altim_in_hg", "Altimeter (Hg)");
    tafFieldKeymap.set("vert_vis_ft", "Vertical vis. ft");
    tafFieldKeymap.set("wx_string", "Weather");
    tafFieldKeymap.set("sky_condition", "Sky condition");
    tafFieldKeymap.set("icing_condition", "Icing condition");
    tafFieldKeymap.set("turbulence_condition", "Turbulence condition");
    tafFieldKeymap.set("sky_cover", "Sky cover");
    tafFieldKeymap.set("cloud_base_ft_agl", "Cloud base ft AGL");
    tafFieldKeymap.set("cloud_base", "Cloud base");
}

/**
 * Load metar normalized field names
 */
 function loadMetarFieldKeymap() {
    metarFieldKeymap.set("raw_text", "raw text");
    metarFieldKeymap.set("station_id", "station id"); 
    metarFieldKeymap.set("observation_time", "Observation Time");
    metarFieldKeymap.set("latitude", "latitude");
    metarFieldKeymap.set("longitude", "longitude");
    metarFieldKeymap.set("temp_c", "Temp °C");
    metarFieldKeymap.set("dewpoint_c", "Dewpoint °C");
    metarFieldKeymap.set("wind_dir_degrees", "Wind dir °"); 
    metarFieldKeymap.set("wind_speed_kt", "Wind speed kt");
    metarFieldKeymap.set("wind_gust_kt", "Wind gust kt");
    metarFieldKeymap.set("visibility_statute_mi", "Horiz. vis. statute mi.");
    metarFieldKeymap.set("altim_in_hg", "Altimeter Hg");
    metarFieldKeymap.set("sea_level_pressure_mb", "Sea-level press. Mb");
    metarFieldKeymap.set("quality_control_flags", "Quality control flags");
    metarFieldKeymap.set("wx_string", "Weather");
    metarFieldKeymap.set("sky_condition", "Sky cover");
    metarFieldKeymap.set("sky_cover", "Sky cover");
    metarFieldKeymap.set("cloud_base_ft_agl", "Cloud base ft AGL");
    metarFieldKeymap.set("cloud_base", "Cloud base");
    metarFieldKeymap.set("flight_category", "Flight category");
    metarFieldKeymap.set("three_hr_pressure_tendency_mb", "Press. change past 3 hrs.");
    metarFieldKeymap.set("maxT_c", "Max air temp °C, past 6 hrs");
    metarFieldKeymap.set("minT_c", "Min air temp °C, past 6 hrs");
    metarFieldKeymap.set("maxT24hr_c", "Max air temp °C, past 24 hrs");
    metarFieldKeymap.set("minT24hr_c", "Min air temp °C, past 24 hrs");
    metarFieldKeymap.set("precip_in", "Liquid precip since last METAR");
    metarFieldKeymap.set("pcp3hr_in", "Liquid precip past 3 hrs");
    metarFieldKeymap.set("pcp6hr_in", "Liquid precip past 6 hrs");
    metarFieldKeymap.set("pcp24hr_in", "Liquid precip past 24 hrs");
    metarFieldKeymap.set("snow_in", "Snow (inches)");
    metarFieldKeymap.set("vert_vis_ft", "Vertical vis. (feet)");
    metarFieldKeymap.set("metar_type", "Metar type");
    metarFieldKeymap.set("elevation_m", "Station elev. (meters)");
}

/**
 * Load the wxkeymap Map object with weather code descriptions
 */
function loadWxCodeKeymap() {
    wxCodeKeymap.set("FU", "Smoke");
    wxCodeKeymap.set("VA", "Volcanic Ash");
    wxCodeKeymap.set("HZ", "Haze");
    wxCodeKeymap.set("DU", "Dust");
    wxCodeKeymap.set("SA", "Sand");
    wxCodeKeymap.set("BLDU", "Blowing dust");
    wxCodeKeymap.set("BLSA", "Blowing sand");
    wxCodeKeymap.set("PO", "Dust devil");
    wxCodeKeymap.set("VCSS", "Vicinity sand storm");
    wxCodeKeymap.set("BR", "Mist or light fog");
    wxCodeKeymap.set("MIFG", "More or less continuous shallow fog");
    wxCodeKeymap.set("VCTS", "Vicinity thunderstorm");
    wxCodeKeymap.set("VIRGA", "Virga or precipitation not hitting ground");
    wxCodeKeymap.set("VCSH", "Vicinity showers");
    wxCodeKeymap.set("TS", "Thunderstorm with or without precipitation");
    wxCodeKeymap.set("SQ", "Squalls");
    wxCodeKeymap.set("FC", "Funnel cloud or tornado");
    wxCodeKeymap.set("SS", "Sand or dust storm");
    wxCodeKeymap.set("+SS", "Strong sand or dust storm");
    wxCodeKeymap.set("BLSN", "Blowing snow");
    wxCodeKeymap.set("DRSN", "Drifting snow");
    wxCodeKeymap.set("VCFG", "Vicinity fog");
    wxCodeKeymap.set("BCFG", "Patchy fog");
    wxCodeKeymap.set("PRFG", "Fog, sky discernable");
    wxCodeKeymap.set("FG", "Fog, sky undiscernable");
    wxCodeKeymap.set("FZFG", "Freezing fog");
    wxCodeKeymap.set("-DZ", "Light drizzle");
    wxCodeKeymap.set("DZ", "Moderate drizzle");
    wxCodeKeymap.set("+DZ", "Heavy drizzle");
    wxCodeKeymap.set("-FZDZ", "Light freezing drizzle");
    wxCodeKeymap.set("FZDZ", "Moderate freezing drizzle");
    wxCodeKeymap.set("+FZDZ", "Heavy freezing drizzle");
    wxCodeKeymap.set("-DZRA", "Light drizzle and rain");
    wxCodeKeymap.set("DZRA", "Moderate to heavy drizzle and rain");
    wxCodeKeymap.set("-RA", "Light rain");
    wxCodeKeymap.set("RA", "Moderate rain");
    wxCodeKeymap.set("+RA", "Heavy rain");
    wxCodeKeymap.set("-FZRA", "Light freezing rain");
    wxCodeKeymap.set("FZRA", "Moderate freezing rain");
    wxCodeKeymap.set("+FZRA", "Heavy freezing rain");
    wxCodeKeymap.set("-RASN", "Light rain and snow");
    wxCodeKeymap.set("RASN", "Moderate rain and snow");
    wxCodeKeymap.set("+RASN", "Heavy rain and snow");
    wxCodeKeymap.set("-SN", "Light snow");
    wxCodeKeymap.set("SN", "Moderate snow");
    wxCodeKeymap.set("+SN", "Heavy snow");
    wxCodeKeymap.set("SG", "Snow grains");
    wxCodeKeymap.set("IC", "Ice crystals");
    wxCodeKeymap.set("PE PL", "Ice pellets");
    wxCodeKeymap.set("PE", "Ice pellets");
    wxCodeKeymap.set("PL", "Ice pellets");
    wxCodeKeymap.set("-SHRA", "Light rain showers");
    wxCodeKeymap.set("SHRA", "Moderate rain showers");
    wxCodeKeymap.set("+SHRA", "Heavy rain showers");
    wxCodeKeymap.set("-SHRASN", "Light rain and snow showers");
    wxCodeKeymap.set("SHRASN", "Moderate rain and snow showers");
    wxCodeKeymap.set("+SHRASN", "Heavy rain and snow showers");
    wxCodeKeymap.set("-SHSN", "Light snow showers");
    wxCodeKeymap.set("SHSN", "Moderate snow showers");
    wxCodeKeymap.set("+SHSN", "Heavy snow showers");
    wxCodeKeymap.set("-GR", "Light showers with hail, not with thunder");
    wxCodeKeymap.set("GR", "Moderate to heavy showers with hail, not with thunder");
    wxCodeKeymap.set("TSRA", "Light to moderate thunderstorm with rain");
    wxCodeKeymap.set("TSGR", "Light to moderate thunderstorm with hail");
    wxCodeKeymap.set("+TSRA", "Thunderstorm with heavy rain");
    wxCodeKeymap.set("UP", "Unknown precipitation");
    wxCodeKeymap.set("NSW", "No significant weather");
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
            outstr = wxCodeKeymap.get(vals[i]);
        }
        else {
            outstr += ` / ${wxCodeKeymap.get(vals[i])}`;
        }
    }
    return outstr;
}