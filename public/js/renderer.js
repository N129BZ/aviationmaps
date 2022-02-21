'use strict';

/**
 * Construct all of the application urls 
 */
let URL_HOST_BASE           = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
let URL_HOST_PROTOCOL       = window.location.protocol + "//";
let URL_SERVER              = `${URL_HOST_PROTOCOL}${URL_HOST_BASE}`;
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

/**
 * global properties
 */
let settings = {};
let last_longitude = 0;
let last_latitude = 0;
let last_heading = 0;
let currentZoom = 10;

/**
 * ol.Collections hold features like
 * metars, tafs, airport info, etc.
 */
let metarFeatures = new ol.Collection();
let airportFeatures = new ol.Collection();
let tafFeatures = new ol.Collection();
let heliportFeatures = new ol.Collection();

/**
 * Vector sources
 */
let metarsVectorSource;
let allAirportsVectorSource;
let tafsVectorSource;
let heliportsVectorSource;
let animatedWxTileSource;

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
 * Vector layers
 */
let airportsVectorLayer;
let metarsVectorLayer;
let tafsVectorLayer;
let heliportsVectorLayer;


/**
 * Websocket object, flag, and message definition
 * JSON object that is filled by returned settings
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
 * Icon markers for different weather categories 
 */
let mvfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});
/*--------------------------------------*/
let vfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});
/*--------------------------------------*/
let ifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});
/*--------------------------------------*/
let lifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});
/*--------------------------------------*/
let tafMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/taf.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .55
});
/*--------------------------------------*/
let circleMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/dot.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});
/*--------------------------------------*/
let heliportMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/helipad.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
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
const circleStyle = new ol.style.Style({
    image: circleMarker
});
const heliportStyle = new ol.style.Style({
    image: heliportMarker
});

/**
 * JQuery method to immediately initialize the websocket connection
 */
 $(() => { 
    try {
        let wsurl = `ws://${window.location.hostname}:${settings.wsport}`;
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
                console.log(message.payload);
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
 * Request settings JSON object from server
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
    error: function (request, status, err) {
        console.error(`ERROR PARSING SETTINGS: ${err}`);
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
    error: function (xhr, ajaxOptions, thrownError) {
        console.error(xhr.status, thrownError);
    }
});

/**
 * Async $get for list of airports
 */
$.get({
    async: true,
    type: "GET",
    url: URL_GET_AIRPORTS,
    error: function (request, status, err) {
        console.error(`ERROR GETTING ALL AIRPORTS: ${err}`);
    }
});

/**
 * Called by airport data received from WebSocket 
 * @param {\} jsonobj: JSON object 
 */
function loadAirportsCollection(jsonobj) {
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let isoregion = airport.isoregion.replace("US-", "");
            regionmap.set(isoregion, isoregion);

            if (airport.type !== "heliport") {
                let airportmarker = new ol.Feature({
                    ident: airport.ident,
                    type: airport.type,
                    name: airport.name,
                    isoregion: isoregion,
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
                });
                airportmarker.setId(airport.ident);
                airportmarker.setStyle(circleStyle);
                airportFeatures.push(airportmarker);
            }
            else {
                let heliportmarker = new ol.Feature({
                    ident: airport.ident,
                    type: airport.type,
                    name: airport.name,
                    isoregion: isoregion,
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
                });
                heliportmarker.setId(airport.ident);
                heliportmarker.setStyle(heliportStyle);   
                heliportFeatures.push(heliportmarker);
            }  
        }

        /**
         * Map sort all region airports in alpha order by state
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
    let criteria = event.target.value;
    selectStateFeatures(criteria);
});

/**
 * Called by select event to manipulate features
 * @param {*} criteria: string
 */
function selectStateFeatures(criteria = "allregions") {
    airportFeatures.forEach((feature) => {
        let type = feature.get("type");
        let isoregion = feature.get("isoregion");
        feature.setStyle(circleStyle);
        if (criteria == "small_airport" || criteria == "medium_airport" || criteria == "large_airport") {
            if (type !== criteria) {
                feature.setStyle(new ol.style.Style(undefined));
            }
        }
        else if (isoregion !== criteria && criteria !== "allregions") {
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
 * Event to handle Metar popup or closure
 */
map.on('pointermove', (evt) => {
    let hasfeature = false;
    currentZoom = map.getView().getZoom();
    resizeDots();
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        if (feature) {
            hasfeature = true;
        }
    });
    if (!hasfeature) {
        popupcloser.onclick();
    }
});


map.on('singleclick', (evt) => {
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
});

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
    let temp = convertCtoF(thismetar.temp_c);
    let dewp = convertCtoF(thismetar.dewpoint_c);
    let windir = thismetar.wind_dir_degrees;
    let winspd = thismetar.wind_speed_kt + "";
    let wingst = thismetar.wind_gust_kt + ""; 
    let altim = getAltimeterSetting(thismetar.altim_in_hg);
    let vis = getDistanceUnits(thismetar.visibility_statute_mi);
    let skyconditions = "";
    try {
        let sky = [];
        if (thismetar.sky_condition !== undefined) {    
            thismetar.sky_condition.forEach((condition) => {
                let map = Object.entries(condition);
                map.forEach((item) => {
                    sky.push(item);  
                });
            });
        }
        sky.forEach((level) => {
            let str = replaceAll(level[0], "_", " ");
            str = str.charAt(0).toUpperCase() + str.substring(1);
            skyconditions += `${str}:&nbsp<b>${level[1]}</b><br/>`;
        });
    }
    catch(error){
        console.log(error.message);
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
        let name = ""
        try {
            name = allAirportsVectorSource.getFeatureById(ident).get("name") + ", ";
        }
        catch(error) {
            console.log("Airport name NOT FOUND!");
        }
        let html = `<div id="#featurepopup"><pre><code><p>`
        html +=    `${css}&nbsp&nbsp${name}${ident} - ${cat}&nbsp&nbsp</label><p></p>`;
        html +=   (time != "" && time != "undefined") ? `Time:&nbsp<b>${time}</b><br/>` : "";
        html +=   (temp != "" && temp != "undefined") ? `Temp:&nbsp<b>${temp}</b><br/>` : "";
        html +=   (dewp != "" && dewp != "undefined") ?`Dewpoint:&nbsp<b>${dewp}</b><br/>` : "";
        html += (windir != "" && windir != "undefined") ? `Wind Dir:&nbsp<b>${windir}</b><br/>` : "";
        html += (winspd != "" && winspd != "undefined") ? `Wind Speed:&nbsp<b>${winspd}&nbspkt</b><br/>` : "";
        html += (wingst != "" && wingst != "undefined") ? `Wind Gust:&nbsp<b>${wingst}&nbspkt</b><br/>` : "";
        html +=  (altim != "" && altim != "undefined") ? `Altimeter:&nbsp<b>${altim}&nbsphg</b><br/>` : "";
        html +=    (vis != "" && vis != "undefined") ? `Visibility:&nbsp<b>${vis}</b><br/>` : "";
        html += (skyconditions != "" && skyconditions != "undefined") ? `${skyconditions}` : "";
        html += `</p></code></pre></div>`;
        popupcontent.innerHTML = html;  
        
    }
}

function createTafPopup(feature) {
    let thistaf = feature.get("taf");
    let ident = thistaf.station_id;
    let cat = thistaf.flight_category;
    if (cat == undefined || cat == "undefined"){
        cat = "VFR";
    }
    let time = thistaf.observation_time;
    if (settings.uselocaltimeformetars){
        time = getLocalTimeZone(time);
    }
    let temp = convertCtoF(thistaf.temp_c);
    let dewp = convertCtoF(thistaf.dewpoint_c);
    let windir = thistaf.wind_dir_degrees;
    let winspd = thistaf.wind_speed_kt + "";
    let wingst = thistaf.wind_gust_kt + ""; 
    let altim = getAltimeterSetting(thistaf.altim_in_hg);
    let vis = getDistanceUnits(thistaf.visibility_statute_mi);
    let skyconditions = "";
    try {
        let sky = [];
        if (thistaf.sky_condition !== undefined) {    
            thistaf.sky_condition.forEach((condition) => {
                let map = Object.entries(condition);
                map.forEach((item) => {
                    sky.push(item);  
                });
            });
        }
        sky.forEach((level) => {
            let str = replaceAll(level[0], "_", " ");
            str = str.charAt(0).toUpperCase() + str.substring(1);
            skyconditions += `${str}:&nbsp<b>${level[1]}</b><br/>`;
        });
    }
    catch(error){
        console.log(error.message);
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
        let name = ""
        try {
            name = allAirportsVectorSource.getFeatureById(ident).get("name") + ", ";
        }
        catch(error) {
            console.log("Airport name NOT FOUND!");
        }
        let html = `<div id="#featurepopup"><pre><code><p>`
        html +=    `${css}&nbsp&nbsp${name}${ident} - ${cat}&nbsp&nbsp</label><p></p>`;
        html +=   (time != "" && time != "undefined") ? `Time:&nbsp<b>${time}</b><br/>` : "";
        html +=   (temp != "" && temp != "undefined") ? `Temp:&nbsp<b>${temp}</b><br/>` : "";
        html +=   (dewp != "" && dewp != "undefined") ?`Dewpoint:&nbsp<b>${dewp}</b><br/>` : "";
        html += (windir != "" && windir != "undefined") ? `Wind Dir:&nbsp<b>${windir}</b><br/>` : "";
        html += (winspd != "" && winspd != "undefined") ? `Wind Speed:&nbsp<b>${winspd}&nbspkt</b><br/>` : "";
        html += (wingst != "" && wingst != "undefined") ? `Wind Gust:&nbsp<b>${wingst}&nbspkt</b><br/>` : "";
        html +=  (altim != "" && altim != "undefined") ? `Altimeter:&nbsp<b>${altim}&nbsphg</b><br/>` : "";
        html +=    (vis != "" && vis != "undefined") ? `Visibility:&nbsp<b>${vis}</b><br/>` : "";
        html += (skyconditions != "" && skyconditions != "undefined") ? `${skyconditions}` : "";
        html += `</p></code></pre></div>`;
        popupcontent.innerHTML = html;    
    }
}

function createAirportPopup(feature) {
    let ident = feature.get("ident");
    let name = ""
    try {
        name = allAirportsVectorSource.getFeatureById(ident).get("name") + ", ";
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
                metarFeatures.push(feature);
                try {
                    switch (metar.flight_category) {
                        case 'MVFR':
                            feature.setStyle(mvfrStyle);
                            break;
                        case 'LIFR':
                            feature.setStyle(lifrStyle);
                            break;
                        case 'IFR':
                            feature.setStyle(ifrStyle)
                            break;
                        case 'VFR':
                        default:
                            feature.setStyle(vfrStyle);
                            break;
                    }
                    feature.changed();
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
    let rawnum = .044 * currentZoom;
    let newscale = rawnum.toFixed(3)
    vfrMarker.setScale(newscale);
    mvfrMarker.setScale(newscale);
    lifrMarker.setScale(newscale);
    ifrMarker.setScale(newscale);
    tafMarker.setScale(newscale);
    circleMarker.setScale(newscale);
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

    metarsVectorSource = new ol.source.Vector({
        features: metarFeatures
    });
    metarsVectorLayer = new ol.layer.Vector({
        title: "Metars",
        source: metarsVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 

    heliportsVectorSource = new ol.layer.Vector({
        features: heliportFeatures
    });
    heliportsVectorLayer = new ol.layer.Vector({
        title: "Heliports",
        source: heliportsVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    });

    allAirportsVectorSource = new ol.source.Vector({
        features: airportFeatures
    });
    airportsVectorLayer = new ol.layer.Vector({
        title: "All Airports",
        source: allAirportsVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 
    
    tafsVectorSource = new ol.source.Vector({
        features: tafFeatures
    });
    tafsVectorLayer = new ol.layer.Vector({
        title: "Terminal Area Forecasts",
        source: tafsVectorSource,
        visible: false,
        extent: extent,
        zIndex: 10
    });
        
    map.addLayer(debugTileLayer);
    map.addLayer(airportsVectorLayer);
    map.addLayer(metarsVectorLayer); 
    map.addLayer(tafsVectorLayer);
    map.addLayer(heliportsVectorLayer);
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

    airportsVectorLayer.on('change:visible', () => {
        let visible = airportsVectorLayer.get('visible');
        regioncontrol.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
            regionselect.options[0].selected = true;
            regionselect.value = "allregions"; 
            selectStateFeatures()
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

/**
 * Sets an initial time in the timeclock element
 */
updateInfo();

/**
 * Convert statute miles to desired unit 
 * @param {*} miles: statute miles
 * @returns statute miles, kilometers or nautical miles   
 */
 function getDistanceUnits(miles) {
    let num = miles;
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
    let num = (temp * 9/5 + 32);
    return num.toFixed(1);
});

/**
 * Builds a HTML Table out of a JSON obje
 * @param {*} selector 
 */
function buildHtmlTable(selector) {
    let columns = addAllColumnHeaders(myList, selector);
  
    for (let i = 0; i < myList.length; i++) {
        let row$ = $('<tr/>');
        for (let colIndex = 0; colIndex < columns.length; colIndex++) {
            let cellValue = myList[i][columns[colIndex]];
            if (cellValue == null || cellValue == undefined || cellValue == "undefined") {
                cellValue = "";
            }
            row$.append($('<td/>').html(cellValue));
        }
        $(selector).append(row$);
    }
}
  
/**
 * Adds a header row to the table and returns the set of columns.
 * Need to do union of keys from all records as some records may not contain
 * all records. 
 * @param {*} myList 
 * @param {*} selector 
 * @returns HTML Table Column headers
 */
function addAllColumnHeaders(myList, selector) {
    let columnSet = [];
    let headerTr$ = $('<tr/>');
  
    for (let i = 0; i < myList.length; i++) {
        let rowHash = myList[i];
        for (let key in rowHash) {
            if ($.inArray(key, columnSet) == -1) {
                columnSet.push(key);
                headerTr$.append($('<th/>').html(key));
            }
        }
    }
    $(selector).append(headerTr$);
    return columnSet;
  }

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
