class SensorTile {
    /**
     * - Requires an Aretas Sensor Datum (type, mac, timestmap, etc.)
     * - Initialized Aretas App Instance
     * - Note that the options that can be passed in are NOT currently used
     * @param {*} sensorDatum 
     * @param {*} AAI 
     * @param {*} options 
     */
    constructor(sensorDatum, AAI, options = null) {

        this._sensorDatum = sensorDatum;
        this._mac = sensorDatum.type;
        this._type = sensorDatum.type;
        this._AAI = AAI;
        this._containerElement = null;

        this._tileElement = null;

        this._options = {
            indicatorWidth: 3,
            indicatorColor: "#FFFFFF",
            enableTicks: false,
            tickWidth: 1,
            tickColor: "#CCCCCC",
            tickNumber: 10,
            //how many times the height of the canvas
            tickHeight: 0.3,
        }

        this._observer = null;

    }

    set sensorDatum(arg) {
        this._sensorDatum = sensorDatum;
    }

    get sensorDatum() {
        return this._sensorDatum;
    }

    /**
     * Calling this function:
     * 1. Adds a tile div to the target element
     * 2. Sets up an intersection observer / visibility observer which will
     * 3. Call the callback that actually renders the div content when it becomes visible
     * 
     * @param {*} targetElement 
     * @returns 
     */
    render(targetElement) {

        //setup the intersection observer and render only when the tile shows...
        //add the tile div to the container, keep a reference and when the tile becomes visible, render the content
        const options = {
            root: null,
            rootMagin: "0px",
            threshold: [0.0, 1]
        };

        const observer = new IntersectionObserver((entries, observer) => {
            for (const entry of entries) {
                if (entry.intersectionRatio > 0) {
                    this.becameVisible();
                }
            }
        }, options);

        const divTile = document.createElement("div");
        divTile.setAttribute("class", "col-md-2 status-tile");
        divTile.setAttribute("data-sensor-type", this._sensorDatum.type);

        //need to add these now for filtering, but should be fast.
        const locationObj = this._AAI.getLocationContainingMac(this._sensorDatum.mac);
        const sensorObj = this._AAI.getSensorByMac(this._sensorDatum.mac);

        if (sensorObj.hasOwnProperty("status")) {

            if (sensorObj.status.hasOwnProperty("_status")) {

                let type = -1;
                try {
                    type = parseInt(sensorObj.status._type);
                } catch (e) {
                    console.warn(`could not parseInt sensor status type: ${sensorObj.status._type}`);
                }
                if ((sensorObj.status._status === "SENSOR_ALERT") && (this._sensorDatum.type === type)) {
                    //only set the tile status to SENSOR_ALERT if the Types match
                    divTile.setAttribute("data-sensor-status", sensorObj.status._status);
                } else if (sensorObj.status._status === "SENSOR_ALERT" && this._sensorDatum.type !== type) {
                    divTile.setAttribute("data-sensor-status", "SENSOR_OK");
                } else {
                    divTile.setAttribute("data-sensor-status", sensorObj.status._status);
                }

            }
        }

        const titleSpan = document.createElement("div");
        titleSpan.setAttribute("class", "title-text");
        titleSpan.append(locationObj.streetAddress + "," + locationObj.city);

        const titleSpan2 = document.createElement("div");
        titleSpan2.setAttribute("class", "title-text");
        titleSpan2.append(locationObj.description);

        const titleSpan3 = document.createElement("div");
        titleSpan3.setAttribute("class", "title-text");
        titleSpan3.append(sensorObj.description);

        divTile.append(titleSpan3, titleSpan2, titleSpan);

        this._tileElement = divTile;
        targetElement.append(divTile);

        this._observer = observer;
        observer.observe(divTile);

    }
    /**
     * callback to render the rest of the tile content when it becomes visible in the window
     */
    becameVisible() {

        this._observer.disconnect();

        const sensorDatum = this._sensorDatum;
        const divTile = this._tileElement;
        const sensorObj = this._AAI.getSensorByMac(sensorDatum.mac);

        //make some href links
        const dashIcon = document.createElement("i");
        dashIcon.setAttribute("class", "fas fa-tachometer-alt");

        const dashIconHref = document.createElement("a");
        dashIconHref.setAttribute("href", "sensor.html?mac=" + sensorDatum.mac);
        dashIconHref.setAttribute("title", "Click to go to Device Dashboard");
        dashIconHref.append(dashIcon);

        const chartIcon = document.createElement("i");
        chartIcon.setAttribute("class", "fas fa-chart-area");

        const chartIconHref = document.createElement("a");
        chartIconHref.setAttribute("href", "analytics.html?mac=" + sensorDatum.mac);
        chartIconHref.setAttribute("title", "Click to chart this Monitor");
        chartIconHref.append(chartIcon);

        const liveDataIcon = document.createElement("i");
        liveDataIcon.setAttribute("class", "fas fa-chart-line");

        const liveDataIconHref = document.createElement("a");
        liveDataIconHref.setAttribute("href", "livedata.html?mac=" + sensorDatum.mac);
        liveDataIconHref.setAttribute("title", "Click to view Current Data");
        liveDataIconHref.append(liveDataIcon);

        divTile.append(dashIconHref, chartIconHref, liveDataIconHref);

        const sensorTypeMetadata = this._AAI.getSensorTypeInfo(sensorDatum.type);

        const divSensorTitle = document.createElement("div");
        divSensorTitle.setAttribute("class", "sensor-reading-title sensor-type-str");
        divSensorTitle.append(sensorTypeMetadata.label);

        const divReading = document.createElement("div");
        divReading.setAttribute("class", "sensor-reading-data");
        divReading.append(parseFloat(sensorDatum.data).toFixed(2) + sensorTypeMetadata.units);

        divTile.append(divSensorTitle, divReading);

        const divStatusDiv = document.createElement("div");

        if (sensorObj.hasOwnProperty("status")) {

            //console.log(sensorObj);
            const statusObj = getStatusColor(sensorObj.status, sensorDatum.type);
            divStatusDiv.setAttribute("class", statusObj.cssClass + " sensor-status");
            divStatusDiv.append(`System Status: ${statusObj.statusTxt}`);
        }

        divTile.append(divStatusDiv);

        const timeDiv = document.createElement("div");
        timeDiv.setAttribute("class", "time-text");
        timeDiv.append(new moment(sensorDatum.timestamp).format('MMMM Do YYYY, HH:mm'));

        divTile.append(timeDiv);

        const divGaugeBar = document.createElement("div");
        divGaugeBar.setAttribute("class", "tile-gauge-bar-div");
        divGaugeBar.style.minHeight = "15px";

        divTile.append(divGaugeBar);

        this.drawGradientBar(divGaugeBar);
    }

    drawGradientBar(targetDiv) {

        const width = targetDiv.clientWidth;
        const height = targetDiv.clientHeight;
        const canvas = document.createElement("canvas");
        canvas.setAttribute("class", "tile-gauge-canvas");

        canvas.width = width;
        canvas.height = height;

        canvas.style.borderColor = "#FFFFFF";
        canvas.style.borderWidth = "1px";
        canvas.style.borderStyle = "solid";
        canvas.style.borderRadius = "4px";

        const ctx = canvas.getContext("2d");

        const gradient = ctx.createLinearGradient(0, 0, width, 0);

        const sensorTypeObj = this._AAI.getSensorTypeInfo(this._type);
        const staticZones = this._AAI.getGaugeStaticZones(this._type);
        const expectedRange = this._AAI.getExpectedRange(this._type);

        //console.log(staticZones);
        //console.log(expectedRange);

        let gStop = 0;

        for (const zone of staticZones) {

            const normalWidth = (zone.max - zone.min) / (expectedRange.max - expectedRange.min);
            gStop = gStop + normalWidth;

            //console.log(`gStop:${gStop}`);
            gradient.addColorStop(gStop, zone.strokeStyle);

        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        //draw where we are on the bar
        const zNorm = (this._sensorDatum.data - expectedRange.min) / (expectedRange.max - expectedRange.min);

        //console.log(`Normalized:${zNorm} of analyte value:${this._sensorDatum.data}`);

        const xMiddle = zNorm * width;

        //center the indicator on the position
        const x0 = parseInt(xMiddle - (this._options.indicatorWidth / 2));
        const y0 = 0;
        ctx.shadowBlur = 5;
        ctx.shadowColor = "#000000";
        ctx.fillStyle = this._options.indicatorColor;

        ctx.fillRect(x0, y0, this._options.indicatorWidth, height);
        ctx.shadowBlur = 0;
        //draw the ticks
        const interval = width / this._options.tickNumber;
        const tickPxHeight = height * this._options.tickHeight;

        ctx.beginPath();
        ctx.strokeStyle = this._options.tickColor;
        for (let i = 0; i < width; i += interval) {
            ctx.moveTo(i, height);
            ctx.lineTo(i, height - tickPxHeight);
            ctx.stroke();
        }
        ctx.closePath();
        targetDiv.append(canvas);

    }

}