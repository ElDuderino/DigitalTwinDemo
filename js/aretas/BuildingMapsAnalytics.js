/**
 * Class to encapsulate the functionality of the buildingmaps analytics feature
 * 
 * Requires:
 * - simpleheat.js
 * - color-scheme.js
 * 
 */

class BuildingMapsAnalytics {

    constructor(AAI, containerElement, statsContainerElement = null, qOpts = null) {

        //note that these are currently unused
        if (qOpts == null) {

            this._queryOptions = {
                movingAverage: false,
                mvWindow: 1,
                enableHeatmap: false,
                offsetData: false,
                filterOutliers: false,
                iqrMulti: 10.0,
            };


        } else {
            this._queryOptions = qOpts;
        }

        //dom element that will contain the map layers
        this._container = containerElement;

        //dom element to contain the stats table
        this._statsContainerElement = statsContainerElement;

        //location tag stats table
        this._LTST = null;

        //aretas application instance
        this._AAI = AAI;

        //mainmap canvas
        this._mapCanvas = null;

        //heatmap (not the heatmap canvas, just the heatmap reference)
        this._heatmap = null;

        this._heatmapCanvas = null;

        //the map grid canvas
        this._overlay = null;

        this._eventsLayer = null;

        //keeping track of the Tag History Data in a Map() for mouseover 
        this._tagHistoryMap = new Map();

        //keeping track of the real BO AreaEvent objects for the selected Building Map
        this._currentMapAreaEvents = null;

        //keeping track of the real Tag objects
        this._currentMapTagList = null;

        //keeps track of the currentBuilding map object
        this._currentBuildingMap = null;

        this._colorScheme = null;
        this._strokeColorIndex = 0; //for iterating through the color pallette

        this._mouseHoverSensitivity = 5;

        this._gridScale = 1.0;

        this._enableSpaghetti = false;
        this._displayHeatmap = false;

        //the DOM element of the stats table <table>
        this._statsTable;

        this.initColorScheme();
        this.initCanvases();

        if(this._statsContainerElement !== null){
            this._LTST = new LocationTagsStatsTable(null, this._statsContainerElement);
        }
    }

    set mouseHoverSensitivity(arg) {
        this._mouseHoverSensitivity = arg;
    }

    get mouseHoverSensitivity() {
        return this._mouseHoverSensitivity;
    }

    set gridScale(arg) {
        this._gridScale = arg;
    }

    get gridScale() {
        return this._gridScale;
    }

    set currentBuildingMap(arg) {
        this._currentBuildingMap = arg;
    }

    get currentBuildingMap() {
        return this._currentBuildingMap;
    }

    get overlayCanvas() {
        return this._overlay;
    }

    set currentMapAreaEvents(arg) {
        this._currentMapAreaEvents = arg;
    }

    get currentMapAreaEvents() {
        return this._currentMapAreaEvents;
    }

    set currentMapTagList(arg) {
        this._currentMapTagList = arg;
    }

    get currentMapTagList() {
        return this._currentMapTagList;
    }

    set displayHeatmap(arg) {
        this._displayHeatmap = arg;
    }

    get displayHeatmap() {
        return this._displayHeatmap;
    }

    set enableSpaghetti(arg) {
        this._enableSpaghetti = arg;
    }

    get enableSpaghetti() {
        this._enableSpaghetti = false;
    }

    initCanvases() {

        let width = this._container.clientWidth;
        let height = this._container.clientHeight;

        this._mapCanvas = document.createElement("canvas");
        this._mapCanvas.setAttribute("id", "mapCanvas");
        this._mapCanvas.style = "position:absolute; top: 0; left: 0";

        //append heatmap canvas last
        this._heatmapCanvas = document.createElement("canvas");
        this._heatmapCanvas.setAttribute("id", "heatmapCanvas");
        this._heatmapCanvas.style = "position:absolute; top: 0; left: 0";

        this._heatmap = simpleheat(this._heatmapCanvas);
        this._heatmap.radius(8, 60);

        this._overlay = document.createElement("canvas");
        this._overlay.setAttribute("id", "overlayCanvas");
        this._overlay.style = "position:absolute; top: 0; left: 0";

        this._eventsLayer = document.createElement("canvas");
        this._eventsLayer.setAttribute("id", "eventsCanvas");
        this._eventsLayer.width = width;
        this._eventsLayer.height = height;
        this._eventsLayer.style = "position:absolute; top: 0; left: 0";

        this._container.append(this._overlay, this._mapCanvas, this._heatmapCanvas, this._eventsLayer);

        this.resizeMaps(width, height);

        let classThis = this;
        //the z-order requires the eventsLayer canvas in front of the mapcanvas, so we
        //listen for mousemove events on the eventsLayer canvas
        this._eventsLayer.addEventListener('mousedown', (evt) => {
            classThis.eventCanvasMouseDownCallback(evt, classThis);
        });

    }
    /**
     * Resize the maps
     * @param {*} width 
     * @param {*} height 
     */
    resizeMaps(width, height) {

        this._mapCanvas.width = width;
        this._mapCanvas.height = height;

        this._heatmapCanvas.width = width;
        this._heatmapCanvas.height = height;

        this._overlay.width = width;
        this._overlay.height = height;

        this._eventsLayer.width = width;
        this._eventsLayer.height = height;

    }

    reset() {

        //reset the map canvas
        let ctx = this._mapCanvas.getContext('2d');
        ctx.clearRect(0, 0, this._mapCanvas.width, this._mapCanvas.height);

        //reset the heatmap
        this._heatmap.clear();

        if(this._LTST){
            this._LTST.clearTable();
        }

        //clear the tagHistoryMap
        this._tagHistoryMap = new Map();

        //clear the events canvas?

    }

    /**
     * draw / redraw the grid on the overlay canvas
     */
    drawGrid() {
        SpatialAgentUtils.drawGrid(this._currentBuildingMap, this._gridScale, this._overlay);
    }

    /**
     * Show the measurement grid on the overlay
     * @param {*} visible 
     */
    showGrid(visible) {
        if (visible) {
            this._overlay.style.display = "block";
        } else {
            this._overlay.style.display = "none";
        }
    }
    /**
     * initialize the color schemes we use for the spaghetti trails etc. 
     * provides a palette of unique colors (but aesthetically appealing)
     * that we can iterate through
     */
    initColorScheme() {

        let scm = new ColorScheme();
        scm.from_hue(204)
            .scheme('tetrade')
            .distance(0.9)
            .add_complement(false)
            .variation('default')
            .web_safe(false);

        this._colorScheme = scm.colors();

        //console.log(this._colorScheme);

    }

    /**
     * Render the image to the background of the canvas and resize everything
     */
    renderBuildingMap() {

        this.reset();

        let mapSprite = new Image();

        let classThis = this;

        let buildingMap = this._currentBuildingMap;

        mapSprite.src = ASNAPIURL + "buildingmaps/getimage?bearerToken=" + this._AAI.bearerToken + "&locationId=" +
            buildingMap.owner + "&mapId=" + buildingMap.id;

        mapSprite.onload = function () {

            let w = mapSprite.width;
            let h = mapSprite.height;

            //we do not know the sprite width apriori so we must mutate the building map object after we determine the sprite width
            classThis._currentBuildingMap.spriteWidth = w;
            classThis._currentBuildingMap.spriteHeight = h;

            classThis.resizeMaps(w, h);

            classThis._heatmap = simpleheat(classThis._heatmapCanvas);
            classThis._heatmap.radius(2, 15);

            classThis._container.style.width = `${mapSprite.width}px`;
            classThis._container.style.height = `${mapSprite.height}px`;

            let beforeIndex = 1; // give a name to the index, in cssRules, of the rule we want to get and change. (fragile)

            let styleSheetObject = document.getElementById("locationCSS"); // get a reference to the stylesheet object

            let background = styleSheetObject.sheet.cssRules[beforeIndex].style.background; // get current pseudo element background 
            //console.log(background);
            styleSheetObject.sheet.cssRules[beforeIndex].style.background = "url(\"" + mapSprite.src + "\")"; // set new background 

            //console.log("Width:" + mapSprite.width);
            //console.log("Height:" + mapSprite.height);

            classThis.drawGrid();

        };

    }

    renderHeatMap(locationTagHistory) {

        //heatmap.clear();

        for (const currentPoint of locationTagHistory) {

            try {
                if ((currentPoint != null)) {

                    if (currentPoint.x < this._mapCanvas.width &&
                        currentPoint.x > 0 &&
                        currentPoint.y < this._mapCanvas.height &&
                        currentPoint.y > 0) {

                        this._heatmap.add([parseInt(currentPoint.x), parseInt(currentPoint.y), 1.0]);
                    }

                }

            } catch (error) {

                console.log(error);
            }

        }

        //heatmap.render(0.8, HeatCanvas.LINEAR);
        this._heatmap.draw(1.5);

    }

    scaleCoords(buildingMapObj, locationTagHistory) {

        const ret = [];

        const w = buildingMapObj.actualWidth;
        const h = buildingMapObj.actualHeight;

        const sw = buildingMapObj.spriteWidth;
        const sh = buildingMapObj.spriteHeight;

        const scaleX = buildingMap.spriteWidth / buildingMap.actualWidth;
        const scaleY = buildingMap.spriteHeight / buildingMap.actualHeight;

        for (const s of locationTagHistory) {

            //preserve the real location for the stats calculation
            s.actualX = s.x;
            s.actualY = s.y;

            s.x = parseInt(s.x * scaleX);
            s.y = parseInt(sh - (s.y * scaleY));

            ret.push(s);

        }

        return ret;
    }

    addLabel(ctx, markerText, centerPoint) {

        //console.log("adding marker");

        // Draw a simple box so you can see the position
        let textMeasurements = ctx.measureText(markerText);
        ctx.fillStyle = "#000";
        ctx.globalAlpha = 0.9;
        ctx.fillRect(centerPoint.x - (textMeasurements.width / 2), centerPoint.y - 15, textMeasurements.width, 20);
        ctx.globalAlpha = 1;

        // Draw position above
        ctx.fillStyle = "#fff";
        ctx.fillText(markerText, centerPoint.x - (textMeasurements.width / 2), centerPoint.y);

    }

    getAreaEventById(areaEventId) {
        for (const areaEvent of this._currentMapAreaEvents) {
            if (areaEvent.id == areaEventId) {
                return areaEvent;
            }
        }
    }
    /**
     * Redraw the area events on the events canvas
     * Pass in an empty array to clear the canvas
     * @param {*} selectedAreaEventIds 
     */
    redrawAreaEvents(selectedAreaEventIds) {

        console.log("SELECTED AREA EVENTS CHANGED");

        let ctx = this._eventsLayer.getContext('2d');
        ctx.clearRect(0, 0, this._eventsLayer.width, this._eventsLayer.height);

        for (const areaEventId of selectedAreaEventIds) {

            let areaEventObj = this.getAreaEventById(areaEventId);

            try {

                let points = SpatialAgentUtils.translatePolygon2D(this._currentBuildingMap, areaEventObj.areaPoints);

                if (points.length < 3) {
                    console.log("Polygon for AreaEvent:" + areaEventObj.id + " did not have enough points (has " + points.length + ")");
                    continue;
                }

                //console.log(points);

                let region = new Path2D();

                region.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    region.lineTo(points[i].x, points[i].y);
                }
                region.lineTo(points[0].x, points[0].y);

                region.closePath();
                ctx.strokeStyle = "white";
                ctx.stroke(region);
                let oldAlpha = ctx.globalAlpha;
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = "orange";
                ctx.fill(region, "nonzero");
                ctx.globalAlpha = oldAlpha;

            } catch (e) {
                console.log("Could not draw area event polygon");
                console.log(e);
            }

        }
    }
    /**
     * When this event hook is called, "this" refers to 
     * the actual canvas (event owner), not the class
     * @param {*} evt 
     */
    eventCanvasMouseDownCallback(evt, classThis) {

        let mapMousePos = {};

        //returns the actual (scaled) position / dimensions of the boundingRect
        let rect = classThis._eventsLayer.getBoundingClientRect();

        mapMousePos.x = evt.clientX - rect.left;
        mapMousePos.y = evt.clientY - rect.top;

        //console.debug("Map mouse position:" + mapMousePos.x + "," + mapMousePos.y);

        let scaleX = rect.width / classThis._eventsLayer.offsetWidth;
        let scaleY = rect.height / classThis._eventsLayer.offsetHeight;

        mapMousePos.scaleX = scaleX;
        mapMousePos.scaleY = scaleY;

        //try overriding the calculated position by "descaling"
        mapMousePos.x = mapMousePos.x / scaleX;
        mapMousePos.y = mapMousePos.y / scaleY;

        //console.debug("scale x: " + scaleX);
        //console.debug("scale y: " + scaleY);

        //mouseIntersects(mouseX, mouseY, objectX, objectY, threshold = 15)
        for (let [tagIdKey, historyItems] of classThis._tagHistoryMap) {

            let matched = false;

            for (let i = 0; i < historyItems.length; i++) {

                let historyItem = historyItems[i];

                //send a small amount of history to calculate direction / last pos / next pos / etc
                if (SpatialAgentUtils.mouseIntersects(mapMousePos.x,
                        mapMousePos.y,
                        historyItem.x,
                        historyItem.y,
                        classThis.mouseHoverSensitivity)) {

                    let matchingLocationTag = null;

                    /** get the locationTag BO for the metadata */
                    for (let locationTag of classThis.currentMapTagList) {
                        if (locationTag.tagId == historyItem.tagId) {
                            matchingLocationTag = locationTag;
                            break;
                        }
                    }

                    /** send the previous, current and next history items if we have some */
                    let positions = {
                        current: null,
                        previous: null,
                        next: null,
                    };

                    positions.current = historyItem;

                    //make sure the length of the whole array isn't 1
                    if (historyItems.length > 1) {

                        //get the previous item if there is one and we are not at index 0
                        if (i > 0) {
                            positions.previous = historyItems[i - 1];
                        }

                        //get the next one if there is one
                        if (i < (historyItems.length - 1)) {
                            positions.next = historyItems[i + 1];
                        }

                    }

                    let locationCanvasContainer = document.getElementById("location-canvas-container");

                    SpatialAgentUtils.drawLocationHistoryTooltip(locationCanvasContainer,
                        mapMousePos.x,
                        mapMousePos.y,
                        positions,
                        matchingLocationTag,
                        mapMousePos.scaleX,
                        mapMousePos.scaleY);

                    console.log("Intersected!");
                    matched = true;
                    break;

                } else {
                    SpatialAgentUtils.hideLocationHistoryToolTips();
                }

            }

            if (matched == true) {
                break;
            }
        }
    }

    getTagObjById(tagId) {
        for (const tagObj of this._currentMapTagList) {
            if (tagObj.id == tagId) {
                return tagObj;
            }
        }

        return null;
    }
    /**
     * queryOpts can be a structure with the following:
     * 
     * {
     *  movingAverage: false,
     *  windowSize: 1,
     *  offsetData: false,
     *  iqrFilter: false,
     *  iqrMulti: 10.0,
     *  limit: 10000000
     * }
     * @param {*} tagUUIDs 
     * @param {*} startTime 
     * @param {*} endTime 
     * @param {*} queryOpts 
     */
    doQueries(tagUUIDs, startTime, endTime, queryOpts = null) {

        this._tagHistoryMap.clear();

        if(this._LTST){
            this._LTST.clearTable();
        }

        this.reset();

        let queryData = {};

        //if we have received query options, spread them into the object
        if (queryOpts) {
            queryData = {
                ...queryOpts
            };
        }

        if (queryData.hasOwnProperty("limit") == false) {
            queryData.limit = 10000000;
        }

        queryData.begin = startTime;
        queryData.end = endTime;

        let promises = [];

        for (const tagUUID of tagUUIDs) {

            let tagId = this.getTagObjById(tagUUID).tagId;
            queryData.tagId = tagId;

            promises.push(this.doQuery(queryData));

        }

        return Promise.allSettled(promises);

    }


    /**
     * 
     * @param {*} tagId 
     * @param {*} startTime 
     * @param {*} endTime 
     */
    doQuery(queryData) {

        let classThis = this;

        return $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
                xhr.setRequestHeader('X-AIR-Token', queryData.tagId);
            },
            dataType: "json",
            type: "GET",
            traditional: true,
            url: ASNAPIURL + "locationreporthistory/byrange",
            data: queryData,
            success: (locationTagHistory, status, xhr) => {

                let tagIdToken = xhr.getResponseHeader("X-AIR-Token");

                if (locationTagHistory.length < 1) {
                    bootbox.alert(`No location tag history found for tag id: ${tagIdToken}`);
                    return;
                }

                classThis.renderQuery(locationTagHistory);

                if(classThis._LTST){
                    classThis._LTST.addStatsTr(locationTagHistory);
                }
            },
            error: (error) => {
                console.log(error);
            }
        });


    }

    /**
     * - Renders a location tag history to the canvas
     * - Note that we keep the history in memory between queries
     * - 
     * @param {*} locationTagHistory 
     */
    renderQuery(locationTagHistory) {

        let start = Date.now();

        //console.log("Current building map:");
        //console.log(this._currentBuildingMap);

        /**
         * Scale the location tag history to the building map but preserve the "real" coordinates
         */
        locationTagHistory = SpatialAgentUtils.scaleLocationHistoryCoords(this._currentBuildingMap, locationTagHistory);

        //add the scaled location tag history to the in class Map()
        let tagId = locationTagHistory[0].tagId;
        this._tagHistoryMap.set(tagId, locationTagHistory);

        let ctx = this._mapCanvas.getContext('2d');
        let lastPoint;

        //since we'll be calling this between queries, we want to increment 
        //the color selection globally (in the class scope)
        //let strokeColorIndex = parseInt((Math.random() * 16) - 1);
        this._strokeColorIndex++;
        if (this._strokeColorIndex > this._colorScheme.length) {
            this._strokeColorIndex = 0;
        }
        ctx.strokeStyle = "#" + this._colorScheme[this._strokeColorIndex];
        ctx.fillStyle = ctx.strokeStyle;

        //console.log("strokeIndex:" + this._strokeColorIndex);
        //console.log("strokeStyle:" + ctx.strokeStyle);

        //ctx.strokeStyle = "#9bcb3c";
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 2;
        ctx.beginPath();

        let accX = 0;
        let accY = 0;
        let accXReal = 0;
        let accYReal = 0;

        let i = 0;
        let opacityIncrement = 1.0 / locationTagHistory.length;
        let ctxAlpha = 1.0;

        for (i = 0; i < locationTagHistory.length; i++) {

            let p = locationTagHistory[i];

            accX = accX + p.x;
            accY = accY + p.y;

            accXReal = accXReal + p.actualX;
            accYReal = accYReal + p.actualY;

            if (i == 0) {
                //console.log(spatialAgentData[i]);
                lastPoint = p;
                continue;
            }
            ctx.beginPath();
            //ctx.fillRect(p.x, p.y, 5, 5);
            ctx.globalAlpha = ctxAlpha;
            ctx.arc(p.x, p.y, 4, 2 * Math.PI, false);
            ctx.fillStyle = LightenDarkenColor(ctx.strokeStyle, -50);
            ctx.fill();
            ctx.stroke();
            ctx.closePath();

            if (this._enableSpaghetti) {

                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(p.x, p.y);
            }

            lastPoint = p;

            ctxAlpha = ctxAlpha - opacityIncrement;

        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        console.log("i:" + i);

        let avgX = parseInt(accX / i);
        let avgY = parseInt(accY / i);

        let avgYReal = accYReal / i;
        let avgXReal = accXReal / i;

        console.log("Average X Scaled:" + avgX + " accX:" + accX + " i:" + i);
        console.log("Average Y Scaled:" + avgY + " accY:" + avgY + " i:" + i);

        console.log("Average X:" + avgXReal);
        console.log("Average Y:" + avgYReal);

        ctx.closePath();
        ctx.stroke();

        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(avgX, avgY, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.fillStyle = "blue";
        ctx.fill();
        ctx.closePath();

        let markerText = "Postion X:" + avgXReal.toFixed(2) + ", Y:" + avgYReal.toFixed(2);

        this.addLabel(ctx, markerText, {
            x: avgX,
            y: avgY
        });

        if (this._displayHeatmap == true) {
            this.renderHeatMap(locationTagHistory);
        } else {
            this._heatmap.clear();
            this._heatmap.draw();
        }

        console.log(`Took ${Date.now() - start} ms to render query`);

    }


}


class LocationTagsStatsTable {

    constructor(locationTagHistoryMap, containerElement) {

        this._locationTagHistoryMap = locationTagHistoryMap;
        this._containerElement = containerElement;
        this._tableElement = null;
        this._tableBody = null;

        //construct table
        this.constructTable();
    }

    set locationTagHistory(arg) {
        this._locationTagHistoryMap = arg;
        this.refreshTable();
    }

    get locationTagHistory() {
        return this._locationTagHistoryMap;
    }

    constructTable() {

        console.info("Constructing stats table");

        this.clearParent();

        let c = (name) => document.createElement(name);

        this._tableElement = c("table");
        
        this._tableElement.setAttribute("id", "table-location-tag-history");
        this._tableElement.setAttribute("class", "table table-dark fancy-table");

        this._containerElement.append(this._tableElement);

        let thead = c("thead");
        this._tableElement.append(thead);

        let td1 = c("td");
        td1.append("Tag Id");

        let td2 = c("td");
        td2.append("Average X Pos");

        let td3 = c("td");
        td3.append("Average Y Pos");

        let td4 = c("td");
        td4.append("Distance Travelled");

        let td5 = c("td");
        td5.append("Displacement X");

        let td6 = c("td");
        td6.append("Displacement Y");

        let td7 = c("td");
        td7.append("Average Velocity");

        let td8 = c("td");
        td8.append("Peak Velocity");

        let td9 = c("td");
        td9.append("X Pos Variance");

        let td10 = c("td");
        td10.append("Y Pos Variance");

        let td11 = c("td");
        td11.append("Num Blinks");

        let td12 = c("td");
        td12.append("Start Time");

        let td13 = c("td");
        td13.append("End Time");

        let td14 = c("td");
        td14.append("Record Count");

        thead.append(td1, td2, td3, td4, td5, td6, td7, td8, td9, td10, td11, td12, td13, td14);

        this._tableBody = document.createElement("tbody");

        this._tableElement.append(this._tableBody);

    }

    /**
     * Clear the entire parent element before creating the table
     */
    clearParent() {

        while (this._containerElement.firstChild) {
            this._containerElement.firstChild.remove()
        }

    }

    /**
     * Clear only the table body
     */
    clearTable() {

        let range = document.createRange();
        range.selectNodeContents(this._tableBody);
        range.deleteContents();

    }

    refreshTable() {

        this.clearTable();

        for(const [tagId, locationHistoryList] of this._locationTagHistoryMap){
            this.addStatsTr(locationHistoryList);
        }
    }

    /**
     * Call this to add ONE tag list stats TR
     */
    addStatsTr(locationInfoHistoryList) {
        /**
     * <td>Tag ID</td>
            <td>Average X Pos</td>
            <td>Average Y Pos</td>
            <td>Distance Travelled</td>
            <td>Displacement X</td>
            <td>Displacement Y</td>
            <td>Average Velocity</td>
            <td>Peak Velocity</td>
            <td>X Pos Variance</td>
            <td>Y Pos Variance</td>
            <td>Num Points</td>
        */

        let tr = document.createElement("tr");

        let tdTagId = document.createElement("td");
        let tdAvgX = document.createElement("td");
        let tdAvgY = document.createElement("td");
        let tdDistT = document.createElement("td");
        let tdDispX = document.createElement("td");
        let tdDispY = document.createElement("td");
        let tdAvgVel = document.createElement("td");
        let tdPeakVel = document.createElement("td");
        let tdXPosVariance = document.createElement("td");
        let tdYPosVariance = document.createElement("td");
        let tdSampleCount = document.createElement("td");
        let tdStartTime = document.createElement("td");
        let tdEndTime = document.createElement("td");
        let tdRecordCount = document.createElement("td");


        /**
         var dataObj = {
            type: "",
            min: 0,
            max: 0,
            avg: 0,
            harMean: 0,
            stdDev: 0
        }
        **/

        let statsObj = {};
        let dataArrX = new Array();
        let dataArrY = new Array();
        let dataArrZ = new Array();

        let dispX = 0.0;
        let dispY = 0.0;
        let dispZ = 0.0;

        let distanceTravelled = 0.0;

        let avgVelocityArr = Array();
        let pkVelocity = 0.0;

        let lastXma = 0;
        let lastYma = 0;

        let tagStartTime = 0;
        let tagEndTime = 0;

        if (locationInfoHistoryList.length > 0) {
            tdTagId.append(locationInfoHistoryList[0].tagId);
            tagStartTime = locationInfoHistoryList[0].timestamp;
            tagEndTime = locationInfoHistoryList[0].timestamp;
        }

        for (let i = 0; i < locationInfoHistoryList.length; i++) {

            let l = locationInfoHistoryList[i];

            if (l.timestamp < tagStartTime) {
                tagStartTime = l.timestamp;
            }

            if (l.timestamp > tagEndTime) {
                tagEndTime = l.timestamp;
            }

            dataArrX.push(l.x);
            dataArrY.push(l.y);
            dataArrZ.push(l.z);

            if (i > 0) {

                //last position record
                let lp = locationInfoHistoryList[i - 1];

                let xDisp = lp.x - l.x;
                if (xDisp < 0) {
                    xDisp = -xDisp;
                }

                let yDisp = lp.y - l.y;
                if (yDisp < 0) {
                    yDisp = -yDisp;
                }

                //don't incorporate z yet
                let distance = Math.sqrt(Math.pow((xDisp), 2) + Math.pow((yDisp), 2));
                distanceTravelled = distanceTravelled + distance;

                dispX = dispX + xDisp;
                dispY = dispY + yDisp;

                //velocity
                //(prevIndex * prevAvg + newValue) / (prevIndex + 1);
                let velocity = distance / ((l.timestamp - lp.timestamp) / 1000); //m/s
                if (velocity > pkVelocity) {
                    pkVelocity = velocity;
                }
                avgVelocityArr.push(velocity);

            }

            if (i == 0) {
                lastXma = l.x;
                lastYma = l.y;
            }
        }

        let avgVelocity = ss.mean(avgVelocityArr);

        tdAvgX.append(ss.mean(dataArrX).toFixed(2));
        tdAvgY.append(ss.mean(dataArrY).toFixed(2));
        tdDistT.append(distanceTravelled.toFixed(2));
        tdDispX.append(dispX.toFixed(2));
        tdDispY.append(dispY.toFixed(2));

        tdAvgVel.append(avgVelocity.toFixed(2));
        tdPeakVel.append(pkVelocity.toFixed(2));

        tdXPosVariance.append(ss.variance(dataArrX).toFixed(2));
        tdYPosVariance.append(ss.variance(dataArrY).toFixed(2));

        tdSampleCount.append(locationInfoHistoryList.length);

        tdStartTime.append(new moment(tagStartTime));
        tdEndTime.append(new moment(tagEndTime));
        tdRecordCount.append(locationInfoHistoryList.length);

        tr.append(tdTagId, tdAvgX, tdAvgY, tdDistT, tdDispX, tdDispY, tdAvgVel, tdPeakVel, tdXPosVariance,
            tdYPosVariance, tdSampleCount, tdStartTime, tdEndTime, tdRecordCount);

        this._tableBody.append(tr);

    }

}