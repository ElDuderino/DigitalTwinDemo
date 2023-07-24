class SpatialAgentUtils {

    constructor(AAI) {
        this._AAI = AAI;

        //sensor data map
        this.sensorDataMap = new Map();
        this.sensorDataQueryTimer = null;
    }

    /**
     * The function called by setTimeout to periodically refresh the sensor data 
     * for the passed-in sensorMacs
     * @param {} sensorMacs 
     */
    getLatestSensorDataForTags(sensorMacs) {

        //batch query them
        let jsonStr = JSON.stringify(sensorMacs);

        let classThis = this;

        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
            },
            url: ASNAPIURL + "sensorreport/latest",
            type: 'POST',
            data: jsonStr,
            dataType: "json",
            contentType: "application/json",
            success: function (data, textStatus, xhr) {
                //console.log(data);

                for (let i = 0; i < data.length; i++) {

                    let sensorReading = data[i];

                    //see if we have a map for this MAC
                    let sensorObjectMap = classThis.sensorDataMap.get(sensorReading.mac);

                    if (sensorObjectMap == null) {
                        sensorObjectMap = new Map();
                        classThis.sensorDataMap.set(sensorReading.mac, sensorObjectMap);
                    }

                    let sensorTypeInfo = AAI.getSensorTypeInfo(sensorReading.type);

                    let readingLabel = sensorTypeInfo.label + ": " + sensorReading.data + sensorTypeInfo.units;

                    sensorObjectMap.set(sensorReading.type, {
                        readingLabel: readingLabel,
                        data: sensorReading.data,
                        timestamp: sensorReading.timestamp
                    });
                }
                classThis.sensorDataQueryTimer = setTimeout(function () {
                    classThis.getLatestSensorDataForTags(sensorMacs);
                }, 10000);
            },
            error: function (data) {
                console.log("Error fetching sensor data from cache");
                console.log(data);
            }
        });

    }

    /**
    * We need to translate the spatial agent data co-ordinates and rects to map space for visualization the object currently
    * 
        [{"bearingDegrees":198.57214869820453,
        "centerPoint":
            {"x":7.134366338937227,"y":7.061014225767931},
        "isColliding":false,
        "lastTickMs":1554138196690,
        "lastVelocity":0.01194069383697705,
        "locationTrail":[
            {"calculatedVelocity":0.009035219938318599,"point":{"x":7.372378314213389,"y":7.337573571686194},"timestamp":1554137897465},
            {"calculatedVelocity":0.07807530861405852,"point":{"x":7.144893473587368,"y":7.272645792784966},"timestamp":1554137923648},
            {"calculatedVelocity":0.0590554371080783,"point":{"x":7.224733225603231,"y":7.038130909225816},"timestamp":1554137926821},
            ...],
        "maxLocationTrailSize":20,
        "predictedNextPoint":{"x":7.267996799200773,"y":6.850338473916054},
        "rectangle":{"h":5.0,"w":5.0},
        "uniqueId":51020,
        "willCollide":false}]
       * 
       * @param {*} buildingMapObj 
       * @param {*} spatialAgentDataList 
       */
    static translateSpatialAgentCoords(buildingMapObj, spatialAgentDataList) {

        let ret = [];

        let w = buildingMapObj.actualWidth;
        let h = buildingMapObj.actualHeight;

        let sw = buildingMapObj.spriteWidth;
        let sh = buildingMapObj.spriteHeight;

        let scaleX = buildingMapObj.spriteWidth / buildingMapObj.actualWidth;
        let scaleY = buildingMapObj.spriteHeight / buildingMapObj.actualHeight;

        let offsetX = 0;
        let offsetY = 0;
        let offsetZ = 0;

        if (buildingMapObj.hasOwnProperty("offsetX")) {
            offsetX = buildingMapObj.offsetX;
        }

        if (buildingMapObj.hasOwnProperty("offsetY")) {
            offsetY = buildingMapObj.offsetY;
        }

        if (buildingMapObj.hasOwnProperty("offsetZ")) {
            offsetZ = buildingMapObj.offsetZ;
        }

        let edgePad = 30;

        for (let i = 0; i < spatialAgentDataList.length; i++) {

            let s = spatialAgentDataList[i];

            //backwards compatibility for non-z
            if (s.centerPoint.hasOwnProperty("z") == false) {
                s.centerPoint.z = 0;
            }

            let xPosReal = s.centerPoint.x;
            let yPosReal = s.centerPoint.y;
            let zPosReal = s.centerPoint.z;

            //preserve the real location for the stats table / also constrain the drawn icon to the map area
            s.actualCenterPoint = {};
            s.actualCenterPoint.x = xPosReal;
            s.actualCenterPoint.y = yPosReal;
            s.actualCenterPoint.z = zPosReal;

            /**
           //check for out of bounds condition first (before translating to the centered map and scaling)
           if (s.centerPoint.x > buildingMapObj.actualWidth) {
               s.outOfBounds = true;
               s.centerPoint.x = buildingMapObj.actualWidth;
           }
   
           if (s.centerPoint.x < (0 - offsetX)) {
               s.outOfBounds = true;
               s.centerPoint.x = -offsetX;
           }
   
           if (s.centerPoint.y > (buildingMapObj.actualHeight)) {
               s.outOfBounds = true;
               s.centerPoint.y = buildingMapObj.actualHeight;
           }
   
           if (s.centerPoint.y < (0 - offsetY)) {
               s.outOfBounds = true;
               s.centerPoint.y = -offsetY;
           }
           */

            //scale everything
            s.centerPoint = {};
            s.centerPoint.x = (xPosReal + offsetX) * scaleX;
            s.centerPoint.y = sh - ((yPosReal + offsetY) * scaleY);

            //check again if the x/y coords are below 0 or > SCALED map dimensions
            //this is duplicated code, but it's somewhat necessary since we can now use some arbitrary pixel padding values
            if (s.centerPoint.x > sw) {
                s.outOfBounds = true;
                s.centerPoint.x = sw - edgePad;
            }

            if (s.centerPoint.x <= 0) {
                s.outOfBounds = true;
                s.centerPoint.x = 0 + edgePad;
            }

            if (s.centerPoint.y > sh) {
                s.outOfBounds = true;
                s.centerPoint.y = sh - edgePad;
            }

            if (s.centerPoint.y <= 0) {
                s.outOfBounds = true;
                s.centerPoint.y = 0 + edgePad;
            }


            s.rectangle.w = s.rectangle.w * scaleX;
            s.rectangle.h = s.rectangle.h * scaleY;

            for (let j = 0; j < s.locationTrail.length; j++) {
                s.locationTrail[j].point.x = (s.locationTrail[j].point.x + offsetX) * scaleX;
                s.locationTrail[j].point.y = sh - ((s.locationTrail[j].point.y + offsetY) * scaleY);
            }

            s.predictedNextPoint.x = (s.predictedNextPoint.x + offsetX) * scaleX;
            s.predictedNextPoint.y = sh - ((s.predictedNextPoint.y + offsetY) * scaleY);

            ret.push(s);

        }

        return ret;
    }

    /**
     * Translates / scales 2D map based polygon coordinates to "real" coordinates
     */
    static translatePolygon2DMapToReal(buildingMapObj, pointList) {

        let ret = [];

        let wReal = buildingMapObj.actualWidth;
        let hReal = buildingMapObj.actualHeight;

        let sw = buildingMapObj.spriteWidth;
        let sh = buildingMapObj.spriteHeight;

        let scaleX = wReal / sw;
        let scaleY = hReal / sh;

        for (let i = 0; i < pointList.length; i++) {

            let p = pointList[i];

            let newPoint = {};

            newPoint.x = p.x * scaleX;
            newPoint.y = ((sh - p.y) * scaleY);

            ret.push(newPoint);

        }

        return ret;

    }

    /**
     * Translates / scales the 2D features of a polygon with points in "real coordinates" to map coordinates
     * @param buildingMapObj
     * @param pointList
     * @returns {[]}
     */
    static translatePolygon2D(buildingMapObj, pointList) {

        let ret = [];

        let w = buildingMapObj.actualWidth;
        let h = buildingMapObj.actualHeight;

        let sw = buildingMapObj.spriteWidth;
        let sh = buildingMapObj.spriteHeight;

        let scaleX = buildingMapObj.spriteWidth / buildingMapObj.actualWidth;
        let scaleY = buildingMapObj.spriteHeight / buildingMapObj.actualHeight;

        for (let i = 0; i < pointList.length; i++) {

            let p = pointList[i];

            let newPoint = {};

            newPoint.x = p.x * scaleX;
            newPoint.y = sh - ((p.y) * scaleY);

            ret.push(newPoint);

        }

        return ret;
    }

    /**
     * rescales the locationTaghistory we received from the REST API to fit the buildingMap pixels
     * 
     * @param {} buildingMapObj 
     * @param {*} locationTaghistory 
     */
    static scaleLocationHistoryCoords(buildingMapObj, locationTaghistory) {

        let ret = [];

        let w = buildingMapObj.actualWidth;
        let h = buildingMapObj.actualHeight;

        let sw = buildingMapObj.spriteWidth;
        let sh = buildingMapObj.spriteHeight;

        let scaleX = buildingMapObj.spriteWidth / buildingMapObj.actualWidth;
        let scaleY = buildingMapObj.spriteHeight / buildingMapObj.actualHeight;

        let offsetX = buildingMapObj.offsetX;
        let offsetY = buildingMapObj.offsetY;

        console.debug("Building map sprite width:" + buildingMapObj.spriteWidth + " height:" + buildingMapObj.spriteHeight);
        console.debug("scaleX:" + scaleX + " scaleY:" + scaleY);

        for (let i = 0; i < locationTaghistory.length; i++) {

            let s = locationTaghistory[i];

            //preserve the real location for the stats table / also constrain the drawn icon to the map area
            s.actualX = s.x;
            s.actualY = s.y;

            //check for out of bounds condition first (before translating to the centered map and scaling)
            if (s.x > (buildingMapObj.actualWidth - offsetX)) {
                s.outOfBounds = true;
                s.x = buildingMapObj.actualWidth - offsetX;
            }

            if (s.x < (0 - offsetX)) {
                s.outOfBounds = true;
                s.x = 0 - offsetX;
            }

            if (s.y > (buildingMapObj.actualHeight - offsetY)) {
                s.outOfBounds = true;
                s.y = buildingMapObj.actualHeight - offsetY;
            }

            if (s.y < (0 - offsetY)) {
                s.outOfBounds = true;
                s.y = 0 - offsetY;
            }

            s.x = (s.actualX + offsetX) * scaleX;
            s.y = sh - ((s.actualY + offsetY) * scaleY);

            ret.push(s);

        }

        return ret;
    }

    /**
     * draws a tooltip at the supplied mouse coordinates relative to the map
     * @param {*} domTarget 
     * @param {*} mouseX 
     * @param {*} mouseY 
     * @param {*} spatialAgent 
     * @param {*} locationTag 
     */
    drawLocationTagTooltip(domTarget, mouseX, mouseY, spatialAgent, locationTag, scaleX = 1.0, scaleY = 1.0) {

        let toolTipDiv = document.getElementById("stattooltip-" + spatialAgent.uniqueId);

        if (toolTipDiv == null) {

            toolTipDiv = document.createElement("div");
            toolTipDiv.setAttribute("id", "stattooltip-" + spatialAgent.uniqueId);
            toolTipDiv.setAttribute("class", "rtls-tag-tooltip");
        }

        $(toolTipDiv).empty();

        let rect = domTarget.getBoundingClientRect();
        let x = rect.left - mouseX;
        let y = rect.top + mouseY;

        //console.log("Tooltip X:" + x + " Y:" + y);
        //console.log(toolTipDiv);

        $(toolTipDiv).css({
            display: "block",
            position: "absolute",
            left: mouseX + 10,
            top: mouseY + 10,
        });

        toolTipDiv.style.zIndex = "1000";

        if (locationTag != null) {
            $(toolTipDiv).append(locationTag.description);
            $(toolTipDiv).append(document.createElement("br"));
        }

        //console.log(spatialAgent);

        $(toolTipDiv).append("Map Pos X:" + spatialAgent.centerPoint.x.toFixed(2) + " Y:" + spatialAgent.centerPoint.y.toFixed(2));
        if (spatialAgent.centerPoint.hasOwnProperty("z")) {
            $(toolTipDiv).append(" Z:" + spatialAgent.centerPoint.z.toFixed(2));
        }

        $(toolTipDiv).append(document.createElement("br"));

        $(toolTipDiv).append("Real Pos X:" + spatialAgent.actualCenterPoint.x.toFixed(2) + " Y:" + spatialAgent.actualCenterPoint.y.toFixed(2));
        if (spatialAgent.actualCenterPoint.hasOwnProperty("z")) {
            $(toolTipDiv).append(" Z:" + spatialAgent.actualCenterPoint.z.toFixed(2));
        }

        $(toolTipDiv).append(document.createElement("br"));
        $(toolTipDiv).append("Bearing: " + spatialAgent.bearingDegrees.toFixed(2));

        let diff = (new Date).getTime() - spatialAgent.lastTickMs;
        $(toolTipDiv).append(document.createElement("br"));
        $(toolTipDiv).append("RTT: " + diff + "ms");

        $(toolTipDiv).append(document.createElement("br"));
        $(toolTipDiv).append("Vel: " + spatialAgent.lastVelocity.toFixed(2));
        //console.log(spatialAgent);

        //see if the sensor map has sensor data for this tag
        let sensorObjectMap = this.sensorDataMap.get(spatialAgent.uniqueId);

        //console.log(sensorDataMap);

        if (sensorObjectMap == null) {
            //no map for that object (meaning there was likely no associated sensor)
        } else {
            $(toolTipDiv).append(document.createElement("br"));
            for (const [key, value] of sensorObjectMap.entries()) {
                $(toolTipDiv).append(value.readingLabel);
                $(toolTipDiv).append(document.createElement("br"));
            }
        }

        domTarget.append(toolTipDiv);

    }

    /**
     * Compute the average reporting interval based on the location trail report times
     * @param {*} locationTagReport 
     * @returns 
     */
    static getAvgReportInterval(locationTagReport) {

        let accTime = 0;
        let lastTime = null;

        if(locationTagReport.locationTrail.length < 2){
            return -1;
        }

        for(const trailItem of locationTagReport.locationTrail){

            if(lastTime == null){
                lastTime = trailItem.timestamp;
                continue;
            }

            let tDiff = trailItem.timestamp - lastTime;

            lastTime = trailItem.timestamp;
            
            //timestamps not guaranteed to be in order and we don't sort first
            if(tDiff < 0){ tDiff = -tDiff; }

            accTime = accTime + tDiff;

        }

        return (accTime / (locationTagReport.locationTrail.length - 1));

    }

    /**
     * Hide the tooltip
     * @param {} spatialAgent 
     */
    static hideLocationTagToolTip(spatialAgent) {

        let toolTipDiv = document.getElementById("stattooltip-" + spatialAgent.uniqueId);

        if (toolTipDiv != null) {
            $(toolTipDiv).css({
                display: "none",
                position: "absolute",
            });
        }

    }

    /**
     * draws a tooltip at the supplied mouse coordinates relative to the map
     * @param {*} domTarget 
     * @param {*} mouseX 
     * @param {*} mouseY 
     * @param {*} historyItem
     */
    static drawLocationHistoryTooltip(domTarget, mouseX, mouseY, historyItems, locationTag = null, scaleX = 1.0, scaleY = 1.0) {

        let current = historyItems.current;
        let previous = historyItems.previous;
        let next = historyItems.next;

        //console.debug(historyItems);

        let toolTipDiv = document.getElementById("stattooltip-" + current.tagId);

        if (toolTipDiv == null) {

            toolTipDiv = document.createElement("div");
            toolTipDiv.setAttribute("id", "stattooltip-" + current.tagId);
            toolTipDiv.setAttribute("class", "rtls-tag-tooltip");
        }

        //console.debug(toolTipDiv);

        $(toolTipDiv).empty();

        let rect = domTarget.getBoundingClientRect();
        let x = rect.left - mouseX;
        let y = rect.top + mouseY;

        console.debug(current);

        //console.debug("Tooltip X:" + x + " Y:" + y);
        //console.debug(toolTipDiv);

        $(toolTipDiv).css({
            display: "block",
            position: "absolute",
            "z-index": 10000,
            left: mouseX + 10,
            top: mouseY + 10,
            padding: "0.5em",
        });

        //toolTipDiv.style.zIndex = "1000";

        if (locationTag !== null) {

            //location tag ID
            //location tag description

            //timestamp
            toolTipDiv.append("Tag Id: " + locationTag.tagId);
            toolTipDiv.append(document.createElement("br"));

            toolTipDiv.append(locationTag.description);
            toolTipDiv.append(document.createElement("br"));

        }

        SpatialAgentUtils.appendPositionData(toolTipDiv, current, "Position:");

        if (previous !== null) {

            SpatialAgentUtils.appendPositionData(toolTipDiv, previous, "Previous Position:");

        }

        if (next !== null) {

            SpatialAgentUtils.appendPositionData(toolTipDiv, next, "Next Position:");

        }

        domTarget.append(toolTipDiv);

    }

    static appendPositionData(toolTipDiv, historyItem, label) {

        toolTipDiv.append(label);
        toolTipDiv.append(document.createElement("br"));
        toolTipDiv.append(new moment(historyItem.timestamp).format("YYYY-MM-DD hh:mm:ss"));
        toolTipDiv.append(document.createElement("br"));
        toolTipDiv.append(`X: ${historyItem.actualX.toFixed(2)} Y: ${historyItem.actualY.toFixed(2)}`);
        toolTipDiv.append(document.createElement("br"));

    }

    /**
     * Hide the tooltips
     */
    static hideLocationHistoryToolTips() {

        //close any of the tooltip divs
        //console.log($("div[id^=stattooltip-]"));

        $("div[id^=stattooltip-]").each((index, toolTipDiv) => {
            //console.log(toolTipDiv);
            $(toolTipDiv).css({
                display: "none",
                position: "absolute",
            });

        });

    }

    /**
     * Bootstrap the setTimeout interval query for any sensordata
     * belonging to the current tag list
     * @param {} currentLocationTagList 
     */
    querySensorDataForTags(currentLocationTagList) {

        if (currentLocationTagList == null) {
            console.log("currentLocationTagList is null, will not try and fetch sensor data");
            return;
        }

        if (currentLocationTagList.length < 1) {
            console.log("No location tags to get sensor data for");
            return;
        }

        if (this.sensorDataQueryTimer !== null) {
            try {
                clearTimeout(this.sensorDataQueryTimer);
            } catch (e) {
                console.warn("Could not clear sensorDataQueryTimer");
                console.warn(e);
            }
        }

        //this is bad @FIXME
        //reset the Map();
        this.sensorDataMap = new Map();

        let tagsWithSensorData = [];

        console.log(currentLocationTagList);

        for (let i = 0; i < currentLocationTagList.length; i++) {
            //see if there is an associated sensor uuid
            let locationTag = currentLocationTagList[i];

            if (locationTag.hasOwnProperty("associatedDeviceId")) {
                if (locationTag.associatedDeviceId != "") {
                    let sensorObject = this._AAI.getSensorByID(locationTag.associatedDeviceId);
                    if (sensorObject) {
                        tagsWithSensorData.push(sensorObject.mac);
                    }
                }
            }
        }

        if (tagsWithSensorData.length > 0) {
            this.getLatestSensorDataForTags(tagsWithSensorData);
        } else {
            console.log("No sensors to query");
        }

    }

    /**
     * gets the locationTag BO for this spatialAgent uniqueId out of the currentLocationTagList
     * @param {*} currentLocationTagList 
     * @param {*} uniqueId 
     */
    static getLocationTag(currentLocationTagList, uniqueId) {

        let locationTag = null;

        //get the associated tag
        for (let j = 0; j < currentLocationTagList.length; j++) {
            if (uniqueId == currentLocationTagList[j].tagId) {
                locationTag = currentLocationTagList[j];
                break;
            }
        }

        return locationTag;
    }

    /**
     * Draws the location trail as a line on the target canvas
     * @param {*} s the spatial agent
     * @param {*} ctx the 2d canvas context
     */
    static drawLocationTrailLine(s, ctx) {

        let locationTrail = s.locationTrail;
        var currentPoint, lastPoint;

        if (locationTrail.length > 0) {

            //draw a line from the centerpoint to the first locationTrail[0] point
            ctx.strokeStyle = "#4BACD2";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(s.centerPoint.x, s.centerPoint.y);
            ctx.lineTo(locationTrail[locationTrail.length - 1].point.x, locationTrail[locationTrail.length - 1].point.y);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.strokeStyle = "#4BACD2";
        ctx.lineWidth = 3;
        ctx.beginPath();

        for (let i = 0; i < locationTrail.length; i++) {

            if (i == 0) {
                lastPoint = locationTrail[i].point;
                continue;
            }

            currentPoint = locationTrail[i].point;

            try {

                if ((currentPoint != null) && (lastPoint !== null)) {

                    if (currentPoint.x < canvas.width && currentPoint.x > 0 && currentPoint.y < canvas.height && currentPoint.y > 0) {

                        ctx.moveTo(lastPoint.x, lastPoint.y);
                        ctx.lineTo(currentPoint.x, currentPoint.y);

                    }

                }

            } catch (error) {

                console.log(error);
            }

            lastPoint = currentPoint;

        }

        ctx.closePath();
        ctx.stroke();

    }

    /**
     * Draws the location trail as a curved line on the target canvas
     * @param {*} s the spatial agent
     * @param {*} ctx the 2d canvas context
     */
    static drawLocationTrailCurve(s, ctx) {

        let locationTrail = s.locationTrail;

        locationTrail.reverse();
        ctx.beginPath();
        ctx.strokeStyle = "#4BACD2";
        ctx.lineWidth = 3;

        let points = [];

        for (let i = 0; i < locationTrail.length; i++) {

            let point = locationTrail[i].point;

            points.push(point.x);
            points.push(point.y);
        }

        ctx.moveTo(s.centerPoint.x, s.centerPoint.y);
        ctx.curve(points, 0.4);
        ctx.stroke();
        ctx.closePath();

    }

    /**
     * 
     * @param {*} s the spatial agent with location trail as a member
     * @param {*} ctx the initialized 2d canvas object
     */
    static drawLocationTrailCircles(s, ctx) {

        let locationTrail = s.locationTrail;
        var currentPoint, lastPoint;

        let opacityIncrement = 1.0 / locationTrail.length;
        let ctxAlpha = 1.0;

        s.locationTrail.reverse();

        for (let i = 0; i < locationTrail.length; i++) {

            let p = locationTrail[i].point;

            ctxAlpha = ctxAlpha - opacityIncrement;
            ctx.globalAlpha = ctxAlpha;

            ctx.beginPath();
            ctx.shadowColor = "#228dbe";
            ctx.shadowBlur = 3;
            ctx.arc(p.x, p.y, 5, 2 * Math.PI, false);
            ctx.fillStyle = "#4BACD2";
            ctx.fill();
            ctx.stroke();
            ctx.closePath();

        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

    }

    /**
     * Determines if the mouse is intersecting the object within threshold 
     * @param {*} mouseX 
     * @param {*} mouseY 
     * @param {*} objectX 
     * @param {*} objectY 
     * @param {*} threshold Optional threshold (defaults to 15px)
     */
    static mouseIntersects(mouseX, mouseY, objectX, objectY, threshold = 15) {

        let absX = mouseX - objectX;

        if (absX < 0) {
            absX = -absX;
        }

        let absY = mouseY - objectY;
        if (absY < 0) {
            absY = -absY;
        }

        if ((absX < threshold) && (absY < threshold)) {
            //console.log("x1:" + mouseX + " y1:" + mouseY + " x2:" + objectX + " y2:" + objectY);
            return true;
        }

        return false;
    }


    /**
     * 
     * @param {*} buildingMapObj 
     * @param {*} tickInterval 
     * @param {*} overlayCanvas
     */
    static drawGrid(buildingMapObj, tickInterval, overlayCanvas) {

        console.log(`tickInterval:${tickInterval}`);
        console.log("Building Map:");
        console.log(buildingMapObj);

        if(tickInterval == null || isNaN(tickInterval) || tickInterval < 0 || tickInterval == 0){
            throw `invalid tickInterval! tickInterval was:${tickInterval}`;
        }

        let ctx = overlayCanvas.getContext('2d');

        let w = buildingMapObj.actualWidth;
        let h = buildingMapObj.actualHeight;

        let ctxW = ctx.canvas.width;
        let ctxH = ctx.canvas.height;

        ctx.clearRect(0, 0, ctxW, ctxH);

        let scaleX = ctxW / buildingMapObj.actualWidth;
        let scaleY = ctxH / buildingMapObj.actualHeight;

        let xPos = 0;
        let yPos = ctxH;
        let tickIntervalX = tickInterval * scaleX;
        let tickIntervalY = tickInterval * scaleY;

        console.log("width:" + ctxW);

        ctx.globalAlpha = 0.3;

        while (xPos < ctxW) {

            let markerText = xPos / scaleX;
            markerText = markerText.toFixed(1);

            SpatialAgentUtils.addTickLabelX(markerText.toString(), xPos, ctxH, ctx);

            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#aaaaaa";
            ctx.moveTo(xPos, 0);
            ctx.lineTo(xPos, ctxH);
            ctx.stroke();
            ctx.closePath();

            //console.log("xPos:" + xPos);

            xPos = xPos + tickIntervalX;
        }

        while (yPos > 0) {

            let markerText = yPos / scaleY;
            markerText = buildingMapObj.actualHeight - markerText;
            markerText = markerText.toFixed(1);

            if (markerText != 0)
                SpatialAgentUtils.addTickLabelY(markerText.toString(), yPos, ctx);

            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#aaaaaa";
            ctx.moveTo(0, yPos);
            ctx.lineTo(ctxW, yPos);
            ctx.stroke();
            ctx.closePath();

            //console.log("yPos:" + yPos);

            yPos = yPos - tickIntervalY;

        }


        ctx.globalAlpha = 1.0;
    }

    /**
     * 
     * Add a tick label to the xAxis of the grid
     * 
     * @param {*} markerText 
     * @param {*} xPos 
     * @param {*} ctxH 
     * @param {*} ctx 
     */
    static addTickLabelX(markerText, xPos, ctxH, ctx) {

        //console.log("adding marker");

        let txtPadding = 0;

        ctx.font = "12px Arial";

        let fontHeight = 12 * 1.2;

        // Draw a simple box so you can see the position
        var textMeasurements = ctx.measureText(markerText);
        ctx.fillStyle = "#333333";
        ctx.globalAlpha = 0.9;
        ctx.fillRect(xPos - (textMeasurements.width / 2) - txtPadding, ctxH - txtPadding - fontHeight, textMeasurements.width + txtPadding, fontHeight);
        ctx.globalAlpha = 1;

        // Draw position above
        ctx.fillStyle = "#ccc";
        ctx.fillText(markerText, xPos - (textMeasurements.width / 2) - txtPadding / 2, ctxH - (0.2 * fontHeight) - (txtPadding / 2));

    }

    /**
     * Add a tick label to the Y-axis of this canvas at yPos with markerText as the label
     * 
     * @param {*} markerText 
     * @param {*} yPos 
     * @param {*} ctx 
     */
    static addTickLabelY(markerText, yPos, ctx) {

        //console.log("adding marker");

        let txtPadding = 0;

        ctx.font = "12px Arial";

        let fontHeight = 12 * 1.2;

        ctx.save();
        ctx.translate(0, yPos);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";

        // Draw a simple box so you can see the position
        let textMeasurements = ctx.measureText(markerText);
        ctx.fillStyle = "#333333";
        ctx.globalAlpha = 0.9;
        //ctx.fillRect(0, yPos - txtPadding - fontHeight, textMeasurements.width + txtPadding, fontHeight);
        ctx.fillRect(0 - textMeasurements.width / 2, 0, textMeasurements.width, fontHeight)
        ctx.globalAlpha = 1;

        // Draw position above
        ctx.fillStyle = "#ccc";
        ctx.fillText(markerText, 0, 0 + (fontHeight * 1 / 1.2));
        //ctx.fillText(markerText, 0 + txtPadding / 2, yPos - (0.2 * fontHeight) - (txtPadding / 2));

        ctx.restore();

    }

}