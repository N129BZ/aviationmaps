## Aviation and Weather Maps displays FAA charts, OpenStreetMaps, animated weather, METARS, TAFS, and much more, using nodejs express with the OpenLayers map API.  

### Offline FAA charts include Sectional, Terminal, Helicopter, Caribbean, and both versions of Grand Canyon charts served from mbtiles databases. It can also poll Stratux GPS/AHRS data to plot ownship position and heading over the map, giving basic "moving map" functionality. It can also save position data in a separate history database at user-defined intervals.   

**See https://github.com/N129BZ/chartmaker for an automated FAA chart mbtiles processor**

**Instructions:** Requires node.js. Clone this project, open a terminal in the folder you cloned it to, and enter "npm install". You can then either run the application directly from Visual Studio Code, or enter "npm start" in the terminal. 

###
**User-editable values in settings.json:**
```
{
    "appconfig": {
        "savepositionhistory": false,
        "histintervalmsec": 15000,
        "gpsintervalmsec": 1000,
        "wxupdateintervalmsec": 480000,
        "keepaliveintervalmsec": 30000,
        "httpport": 8080,
        "wsport": 5050,
        "startupzoom": 8,
        "useOSMonlinemap": true,
        "debug": false,
        "osmofflineDb": "osm.mbtiles",
        "sectionalDb": "Sectional.mbtiles",
        "terminalDb": "Terminal.mbtiles",
        "helicopterDb": "Helicopter.mbtiles",
        "caribbeanDb": "Caribbean.mbtiles",
        "gcanyonAoDb": "Grand_Canyon_AO.mbtiles",
        "gcanyonGaDb": "Grand_Canyon_GA.mbtiles",
        "historyDb": "positionhistory.db",
        "uselocaltime": true,
        "distanceunit": "sm", 
        "usestratux": true,
        "stratuxip": "192.168.1.187",
        "stratuxsituationws": "ws://[stratuxip]/situation",
        "stratuxtrafficws": "ws://[stratuxip]/traffic",
        "animatedwxurl": "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi",
        "addswxurl": "https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=###&requestType=retrieve&format=xml&hoursBeforeNow=1.5&mostRecentForEachStation=true&stationString=",
        "addsurrentxmlurl": "https://aviationweather.gov/adds/dataserver_current/current/###.cache.xml",
        "lockownshiptocenter": true,
        "ownshipimage": "svgairplane-green-on-white.svg",
        "trafficimage": "svgairplane-red-on-yellow.svg",
        "firstrun": false,
        "usemetricunits": false
    },
    "distanceunits": {
        "kilometers": "km",
        "nauticalmiles": "nm",
        "statutemiles": "sm"
    },
    "messagetypes": {
        "metars": {
            "type": "metars",
            "token": "###"
        },
        "tafs": {
            "type": "tafs",
            "token": "###"
        },
        "pireps": {
            "type": "pireps",
            "token": "###"
        },
        "airports": {
            "type": "airports",
            "token": ""
        },
        "keepalive": {
            "type": "keepalive",
            "token": "((💜))"
        }
    }
}
```
**NOTE**: As the position history database is empty at first run of the app, the setting ***"lockownshiptocenter"*** has been set to ***true*** by default. This will allow the application to generate and save some position data so that there will be "last known" longitude and latitude coordinates saved in the database. Once there is at least one position history record, you can change that setting to false so that you can pan around the map without it automatically re-centering ownship to the center. You could also use a sqlite database tool to enter a position history record with your preferred latitude and longitude to be used as a center point when the maps are loaded.      

###
**References:**

https://github.com/cyoung/stratux/    
https://openlayers.org/     

###
**Animated weather radar layer over the Sectional chart, ownship image displayed via Stratux integration**
![ANIMWX](./images/SectWithWx.png)
**OpenStreetMap with airport status colored markers and METAR popup**
![OSMWMETAR](./images/OsmWithMetars.png)
**Multiple layers, layer switcher has OSM, Grand Canyon GA, Helicopter, and animated weather selected**
![MULTI](./images/MultiLayer.png)
**Caribbean chart with color-coded airport features, showing a METAR when hovering mouse over an airport**
![CARIBMETAR](./images/CaribbeanWithMetars.png)
**Sectional chart zoomed in**  
![SECTCLOSE](./images/SectionalCloseup.png)
