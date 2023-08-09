class AMGThermalView {

    /**
     * Aretas app instance
     * @param {*} AAI 
     */
    constructor(AAI) {
        this._AAI = AAI;
    }

    /**
     * 
     * @param {*} AMGThermalReport 
     * @param {*} domTarget 
     * @param {*} AAI
     */
    createAMGThermalView(AMGThermalReport, domTarget) {

        $(domTarget).empty();

        var monitorLabel = document.createElement("div");

        var monitorTitle = document.createElement("div");
        monitorTitle.setAttribute("class", "title");
        monitorTitle.append("Device Name:" + this._AAI.getMacLabel(AMGThermalReport.sensorData[0].mac));

        var macTitleSpan = document.createElement("div");
        macTitleSpan.setAttribute("class", "mac");
        macTitleSpan.append("MAC:" + AMGThermalReport.sensorData[0].mac);

        $(monitorLabel).append(monitorTitle, macTitleSpan);

        domTarget.append(monitorLabel);

        var titleSpan = document.createElement("span");
        titleSpan.setAttribute("class", "thermal-image-container-title");
        titleSpan.append("Thermal Image Time Series");

        $(domTarget).append(titleSpan);

        //construct a horizontal slider / animation with the thermal images 
        var thermalImageContainer = document.createElement("div");
        thermalImageContainer.setAttribute("id", "thermal-image-container");

        domTarget.append(thermalImageContainer);

        var imgArr = new Array();

        for (var i = 0; i < AMGThermalReport.sensorData.length; i++) {

            var sensorDatum = AMGThermalReport.sensorData[i];

            var divC = document.createElement("div");
            divC.setAttribute("class", "thermal-img-div");

            var img = document.createElement("img");
            img.setAttribute("class", "amg-thermal-image");
            img.setAttribute("id", "img-" + sensorDatum.timestamp);

            let uri = this.buildThermalImgURI(sensorDatum.data);

            img.setAttribute("tmpSrc", uri);

            var toolTipDiv = document.createElement("div");
            toolTipDiv.setAttribute("id", "tooltip-" + sensorDatum.timestamp);
            toolTipDiv.setAttribute("class", "thermal-temp-tooltip");

            $(toolTipDiv).css({
                display: "none",
                position: "absolute",
            });

            divC.append(toolTipDiv);

            $(img).on('mousemove', function (e) {

                var x = e.pageX - $(e.target).offset().left;
                var y = e.pageY - $(e.target).offset().top;
                var w = $(e.target).width();
                var h = $(e.target).height();
                var timestamp = $(e.target).attr('id').split('-')[1];


                //console.log("X:" + x + " Y:" + y + " W:" + w + " H:" + h);
                var temperature = AMGThermalView.getPixelTemperature(AMGThermalReport, x, y, w, h, timestamp);

                if (temperature != null) {

                    let t = $("#tooltip-" + timestamp);

                    $(t).css({
                        display: "block",
                        position: "absolute",
                        top: y,
                        left: x + 10
                    });

                    $(t).empty();
                    $(t).append("Temp:" + temperature + "°C");
                }
                //console.log($(e.target).attr('id'));
            });

            $(img).on('mouseleave', function (e) {
                //get rid of the tooltip div
                let timestamp = $(e.target).attr('id').split('-')[1];
                $("#tooltip-" + timestamp).css({
                    display: "none"
                });
            });

            divC.append(img);

            var spanDate = document.createElement("div");
            spanDate.setAttribute("class", "stat thermal-div-date");
            spanDate.append(moment(sensorDatum.timestamp).format());

            var spanMin = document.createElement("div");
            spanMin.setAttribute("class", "stat thermal-div-min");
            spanMin.append("Min:" + sensorDatum.min.toFixed(2));

            var spanMax = document.createElement("div");
            spanMax.setAttribute("class", "stat thermal-div-max");
            spanMax.append("Max:" + sensorDatum.max.toFixed(2));

            var spanAvg = document.createElement("div");
            spanAvg.setAttribute("class", "stat thermal-div-avg");
            spanAvg.append("Avg:" + sensorDatum.avg.toFixed(2));

            divC.append(spanDate, spanMin, spanMax, spanAvg);

            imgArr.push("img-" + sensorDatum.timestamp);

            thermalImageContainer.append(divC);
        }

        for (let i = 0; i < imgArr.length; i++) {

            var img = document.getElementById(imgArr[i]);

            var waypoint = new Waypoint({
                element: img,
                handler: function (direction) {
                    //console.log("waypoint reached..." + uri);
                    if (this.element.getAttribute("tmpSrc") != "") {
                        this.element.setAttribute("src", this.element.getAttribute("tmpSrc"));
                        this.element.setAttribute("tmpSrc", "");
                    }
                },
                context: document.getElementById('thermal-image-container'),
                horizontal: true,
                offset: 'right-in-view'
            });

        }

        var row = document.createElement("div");
        row.setAttribute("class", "row");

        domTarget.append(row);

        //create the line chart with the min/max/avg timeseries data
        this.createThermalStatsChart(AMGThermalReport, row);

        //construct the 3D surface plot animation
        this.createThermalSurfacePlot(AMGThermalReport, row);

        //clear any floats here
        $(domTarget).append("<div class=\"clearfix\"></div>");

        //create the stats footer
        this.createThermalStats(AMGThermalReport, domTarget);
    }

    static getPixelTemperature(AMGThermalReport, x, y, imgWidth, imgHeight, timestamp) {

        var AMG_PIXEL_W = 8;
        var AMG_PIXEL_H = 8;
    
        var sensorDatum = null;
        for (var i = 0; i < AMGThermalReport.sensorData.length; i++) {
    
            if (AMGThermalReport.sensorData[i].timestamp == timestamp) {
                sensorDatum = AMGThermalReport.sensorData[i];
                break;
            }
        }
    
        if (sensorDatum != null) {
    
            //get the rescaled x,y coordinate
            var rescaledX = (AMG_PIXEL_W / imgWidth) * x;
            var rescaledY = (AMG_PIXEL_H / imgHeight) * y;
    
            rescaledX = Math.floor(rescaledX);
            rescaledY = Math.floor(rescaledY);
    
            //calculate the array index of the pixel since our array of data is "unfolded"
            var arrIndex = (rescaledY * AMG_PIXEL_H) + rescaledX;
    
            if (arrIndex > sensorDatum.data.length) {
                console.log("Out of bounds of sensorDatum data Array x:" + rescaledX + " y:" + rescaledY + " idx:" + arrIndex);
                return null;
            } else {
                //console.log("Pixel Temperature @ x:" + rescaledX + " y:" + rescaledY + " idx:" + arrIndex + " =" + sensorDatum.data[arrIndex]);
                return sensorDatum.data[arrIndex];
            }
    
        }
    
    }

    static getPixelTemperature2(sensorDatum, x, y, imgWidth, imgHeight) {

        var AMG_PIXEL_W = 8;
        var AMG_PIXEL_H = 8;
    
        //get the rescaled x,y coordinate
        var rescaledX = (AMG_PIXEL_W / imgWidth) * x;
        var rescaledY = (AMG_PIXEL_H / imgHeight) * y;
    
        rescaledX = Math.floor(rescaledX);
        rescaledY = Math.floor(rescaledY);
    
        //calculate the array index of the pixel since our array of data is "unfolded"
        var arrIndex = (rescaledY * AMG_PIXEL_H) + rescaledX;
    
        if (arrIndex > sensorDatum.data.length) {
            console.log("Out of bounds of sensorDatum data Array x:" + rescaledX + " y:" + rescaledY + " idx:" + arrIndex);
            return null;
        } else {
            console.log("Pixel Temperature @ x:" + rescaledX + " y:" + rescaledY + " idx:" + arrIndex + " =" + sensorDatum.data[arrIndex]);
            return sensorDatum.data[arrIndex];
        }
    
    }

    
    /**
     * Build a URL to fetch an interpolated / palletized thermal image from the API 
     * @param {*} data 
     * @returns 
     */
     buildThermalImgURI(data) {

        var uri = ASNAPIURL + "extutils/thermalimagehelper?thermalData=";
    
        for (var p = 0; p < data.length; p++) {
    
            uri = uri + data[p];
            if (p < data.length - 1) {
                uri = uri + ",";
            }
        }
    
        return uri;
    
    }

    createThermalSurfacePlot(AMGThermalReport, domTarget) {

        // Instantiate our graph object.
        let amgThermalDiv = document.createElement("div");
        amgThermalDiv.setAttribute("id", "viz-amg-thermal");
        amgThermalDiv.setAttribute("class", "col-md-auto");
    
        let titleDiv = document.createElement("div");
        titleDiv.setAttribute("class", "title-div");
    
        let titleSpan = document.createElement("span");
        titleSpan.setAttribute("class", "span-title");
        titleSpan.append("3D Thermal Data Surface Plot");
    
        $(titleDiv).append(titleSpan);
    
        $(amgThermalDiv).append(titleDiv);
    
        let container = document.createElement("div");
        container.setAttribute("id", "thermal-surface-plot-container");
    
        $(amgThermalDiv).append(container);
    
        $(domTarget).append(amgThermalDiv);
    
        // Create and populate a data table.
        let dataV = new vis.DataSet();
    
        //insert the data for one surface 
        let dataToChart;
    
        //console.log(dataToChart);
        let row, column;
        row = 0;
        column = 0;
        let counter = 0;
    
        for (let n = 0; n < AMGThermalReport.sensorData.length; n++) {
    
            dataToChart = AMGThermalReport.sensorData[n].data;
            column = 0;
            row = 0;
    
            for (let o = 0; o < dataToChart.length; o++) {
    
                dataV.add({
                    id: counter++,
                    filter: n,
                    x: column,
                    y: row,
                    z: dataToChart[o],
                    style: dataToChart[o]
                });
    
                if (column == 7) {
                    row = row + 1;
                    column = 0;
                } else {
                    column++;
                }
            }
    
        }
    
        // specify options
        let options = {
            style: 'surface',
            showPerspective: true,
            showGrid: true,
            showShadow: false,
            keepAspectRatio: false,
            verticalRatio: 0.5,
            animationInterval: 50, // milliseconds
            animationPreload: true,
            zValueLabel: function (z) {
                return z + "°C"
            }
            //showAnimationControls: true
        };
    
        let graph = new vis.Graph3d(container, dataV, options);
    }

    createThermalStats(AMGThermalReport, domTarget) {

        let titleSpan = document.createElement("span");
        titleSpan.setAttribute("class", "span-title");
        titleSpan.append("Time Span Statistics");
    
        let thermalStatsDiv = document.createElement("div");
        thermalStatsDiv.setAttribute("id", "thermal-stats-div");
    
        thermalStatsDiv.append(titleSpan);
    
        let divTimeSpan = document.createElement("div");
        divTimeSpan.setAttribute("id", "thermal-time-span");
    
        thermalStatsDiv.append(divTimeSpan);
    
        let divAvgs = document.createElement("div");
        divAvgs.setAttribute("class", "div-thermal-stats-info");
    
        let titleSpanAvg = document.createElement("span");
        titleSpanAvg.setAttribute("class", "title");
        titleSpanAvg.append("Consolidated Averages");
    
        //avgOfAll
        let divAvgA = document.createElement("div");
        divAvgA.append("Average of All Thermal Readings: " + AMGThermalReport.avgOfAll + "°C");
    
        //avgOfAllCoolest
        let divAvgB = document.createElement("div");
        divAvgB.append("Average of all Coolest Pixels: " + AMGThermalReport.avgOfAllCoolest + "°C");
    
        //avgOfAllHottest
        let divAvgC = document.createElement("div");
        divAvgC.append("Average of all Hottest Pixels: " + AMGThermalReport.avgOfAllHottest + "°C");
    
        divAvgs.append(titleSpanAvg, divAvgA, divAvgB, divAvgC);
    
        thermalStatsDiv.append(divAvgs);
    
        //highestAvgTimestamp
        let divContainerA = document.createElement("div");
        divContainerA.setAttribute("class", "stat-thermal-image-container");
    
        let sensorDatumA = AMGThermalView.getSensorDatumByTimestamp(AMGThermalReport, AMGThermalReport.highestAvgTimestamp);
        let divA = this.generateThermalImageDiv(sensorDatumA);
    
        let titleSpanA = document.createElement("span");
        titleSpanA.setAttribute("class", "title");
        titleSpanA.append("Highest Average");
        divContainerA.append(titleSpanA, divA);
    
        thermalStatsDiv.append(divContainerA);
    
        //highestPeakPixelTimestamp
        let divContainerB = document.createElement("div");
        divContainerB.setAttribute("class", "stat-thermal-image-container");
    
        let sensorDatumB = AMGThermalView.getSensorDatumByTimestamp(AMGThermalReport, AMGThermalReport.highestPeakPixelTimestamp);
        let divB = this.generateThermalImageDiv(sensorDatumB);
    
        let titleSpanB = document.createElement("span");
        titleSpanB.setAttribute("class", "title");
        titleSpanB.append("Hottest Pixel");
        divContainerB.append(titleSpanB, divB);
    
        thermalStatsDiv.append(divContainerB);
    
        //lowestAvgTimestamp
        let divContainerC = document.createElement("div");
        divContainerC.setAttribute("class", "stat-thermal-image-container");
    
        let sensorDatumC = AMGThermalView.getSensorDatumByTimestamp(AMGThermalReport, AMGThermalReport.lowestAvgTimestamp);
        let divC = this.generateThermalImageDiv(sensorDatumC);
    
        let titleSpanC = document.createElement("span");
        titleSpanC.setAttribute("class", "title");
        titleSpanC.append("Lowest Average");
    
        divContainerC.append(titleSpanC, divC);
        thermalStatsDiv.append(divContainerC);
    
        //lowestLowPixelTimestamp
        let divContainerD = document.createElement("div");
        divContainerD.setAttribute("class", "stat-thermal-image-container");
    
        let sensorDatumD = AMGThermalView.getSensorDatumByTimestamp(AMGThermalReport, AMGThermalReport.lowestLowPixelTimestamp);
        let divD = this.generateThermalImageDiv(sensorDatumD);
    
        let titleSpanD = document.createElement("span");
        titleSpanD.setAttribute("class", "title");
        titleSpanD.append("Coolest Pixel");
    
        divContainerD.append(titleSpanD, divD);
    
        thermalStatsDiv.append(divContainerD);
    
        $(domTarget).append(thermalStatsDiv);
    
    }

    static getSensorDatumByTimestamp(AMGThermalReport, timestamp) {

        for (let i = 0; i < AMGThermalReport.sensorData.length; i++) {
            if (AMGThermalReport.sensorData[i].timestamp == timestamp) {
                return AMGThermalReport.sensorData[i];
            }
        }
    
        return null;
    }

    generateThermalImageDiv(sensorDatum) {

        let divC = document.createElement("div");
        divC.setAttribute("class", "thermal-img-div");
    
        let img = document.createElement("img");
        img.setAttribute("class", "amg-thermal-image");
        img.setAttribute("id", "statimg-" + sensorDatum.timestamp);
    
        let uri = this.buildThermalImgURI(sensorDatum.data);
    
        img.setAttribute("src", uri);
    
        let toolTipDiv = document.createElement("div");
        toolTipDiv.setAttribute("id", "stattooltip-" + sensorDatum.timestamp);
        toolTipDiv.setAttribute("class", "thermal-temp-tooltip");
    
        $(toolTipDiv).css({
            display: "none",
            position: "absolute",
        });
    
        divC.append(toolTipDiv);
    
        $(img).on('mousemove', function (e) {
    
            let x = e.pageX - $(e.target).offset().left;
            let y = e.pageY - $(e.target).offset().top;
            let w = $(e.target).width();
            let h = $(e.target).height();
            let timestamp = $(e.target).attr('id').split('-')[1];
    
            //console.log("X:" + x + " Y:" + y + " W:" + w + " H:" + h);
            let temperature = AMGThermalView.getPixelTemperature2(sensorDatum, x, y, w, h);
    
            if (temperature != null) {
    
                let t = $("#stattooltip-" + timestamp);
    
                $(t).css({
                    display: "block",
                    position: "absolute",
                    top: y,
                    left: x + 10
                });
    
                $(t).empty();
                $(t).append("Temp:" + temperature + "°C");
            }
            //console.log($(e.target).attr('id'));
        });
    
        $(img).on('mouseleave', function (e) {
            //get rid of the tooltip div
            let timestamp = $(e.target).attr('id').split('-')[1];
            $("#stattooltip-" + timestamp).css({
                display: "none"
            });
        });
    
        divC.append(img);
    
        let spanDate = document.createElement("div");
        spanDate.setAttribute("class", "stat thermal-div-date");
        spanDate.append(moment(sensorDatum.timestamp).format());
    
        let spanMin = document.createElement("div");
        spanMin.setAttribute("class", "stat thermal-div-min");
        spanMin.append("Min:" + sensorDatum.min.toFixed(2));
    
        let spanMax = document.createElement("div");
        spanMax.setAttribute("class", "stat thermal-div-max");
        spanMax.append("Max:" + sensorDatum.max.toFixed(2));
    
        let spanAvg = document.createElement("div");
        spanAvg.setAttribute("class", "stat thermal-div-avg");
        spanAvg.append("Avg:" + sensorDatum.avg.toFixed(2));
    
        divC.append(spanDate, spanMin, spanMax, spanAvg);
    
        return divC;
    }

    createThermalStatsChart(AMGThermalReport, domTarget) {

        let chartDiv = document.createElement("div");
        chartDiv.setAttribute("id", "thermal-stats-chart");
        chartDiv.setAttribute("class", "col-lg");
    
        domTarget.append(chartDiv);
    
        let datasets = new Map();
        let i = 0;
        let typeReadings;
        let mac = 0;
    
        let avgDataset = new Array();
        let minDataset = new Array();
        let maxDataset = new Array();
    
        datasets.set("avg", avgDataset);
        datasets.set("min", minDataset);
        datasets.set("max", maxDataset);
    
        for (i = 0; i < AMGThermalReport.sensorData.length; i++) {
    
            let sensorDatum = AMGThermalReport.sensorData[i];
    
            mac = sensorDatum.mac; //waste of cycles.. 
    
            let datumAvg = {};
            datumAvg.x = sensorDatum.timestamp;
            datumAvg.y = sensorDatum.avg;
    
            datasets.get("avg").push(datumAvg);
    
            let datumMin = {};
            datumMin.x = sensorDatum.timestamp;
            datumMin.y = sensorDatum.min;
    
            datasets.get("min").push(datumMin);
    
            let datumMax = {};
            datumMax.x = sensorDatum.timestamp;
            datumMax.y = sensorDatum.max;
    
            datasets.get("max").push(datumMax);
    
        }
    
        let ctx = document.createElement("canvas");
        ctx.setAttribute("id", "ctxFullChart");
    
        chartDiv.append(ctx);
    
        let scatterChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                elements: {
                    point: {
                        hitRadius: 4,
                        hoverRadius: 4
                    }
                },
                tooltips: {
                    enabled: true,
                    mode: 'index',
                    callbacks: {
                        title: function (tooltipItems, data) {
                            let ret = "";
                            for (let i = 0; i < tooltipItems.length; i++) {
                                ret = ret + "Time: " + formatDate(tooltipItems[i].xLabel);
                            }
                            return ret;
                        },
                        label: function (tooltipItems, data) {
    
                            let ret = "";
                            ret = ret + data.datasets[tooltipItems.datasetIndex].label +
                                ":" + tooltipItems.yLabel;
                            return ret;
                        }
                    }
                },
                responsive: true,
                cubicInterpolationMode: 'monotone',
                scales: {
                    xAxes: [{
                        type: 'linear',
                        position: 'bottom',
                        //format the labels on the chart (timestamps to nice formatted time string)
                        ticks: {
                            callback: function (value, index, values) {
                                //console.log("value" + value + " index:" + index + " values:" + values);
                                return formatDate(value);
                            }
                        },
                        gridLines: {
                            color: "#999999"
                        }
                    }],
                    yAxes: [{
                        type: 'linear',
                        gridLines: {
                            color: "#999999"
                        }
                    }]
                }
            }
        });
    
        /* 
        iterate through all the types for this MAC and
        create a more Chart.js friendly dataset
        */
        for (let key of datasets.keys()) {
    
            let dataArr = datasets.get(key);
            let sInfo = this._AAI.getSensorTypeInfo(key);
            let dataSet = {
                radius: 2,
                label: "Thermal " + key,
                data: dataArr,
                showLine: true,
                fill: false,
                borderColor: AMGThermalView.getThermalChartLineColor(key),
                borderWidth: 2,
                cubicInterpolationMode: 'monotone'
            };
            scatterChart.data.datasets.push(dataSet);
            scatterChart.update();
        }
    
    }

    static getThermalChartLineColor(type) {

        switch (type) {
            case "avg":
                return "#B10197";
    
            case "min":
                return "#84009D";
    
            case "max":
                return "#FFBC00";
    
            default:
                return "#000000";
        }
    }
}


/** we need to decode the array of bytes into an array of floats  */
/**
 * The raw data stored in the WS is an array of bytes but the AMG thermal data is a 8x8 array of floats
 * @param {*} data 
 */
function decodeThermalDataFromWS(data) {

    var counter = 0;

    $.each(data, function (key, value) {

        var byteArray = value.data;
        var retArray = new Array();

        var tmpArray = new Array();
        var buf = new ArrayBuffer(4);
        var view = new DataView(buf);
        var incr = 0;

        for (var i = 0; i < byteArray.length; i++) {

            tmpArray[incr] = byteArray[i];

            if (incr == 3) {
                incr = 0;
                tmpArray.forEach(
                    function (b, i) {
                        view.setUint8(i, b);
                    }
                );

                var num = view.getFloat32(0);
                retArray.push(num);
                //console.log(num);
            } else {
                incr++;
            }

        }

        value.data = retArray;
        //console.log("length:" + retArray.length);

    });

    console.log("Done translation..");

}
/**
 * 
 * @param {*} data 
 */
function createThermalStatsObject(data) {

    var ret = {};

    /** create thermal stats object from an array of thermal readings */
    var min = {
        min: 0,
        timestamp: 0
    };
    var max = {
        max: 0,
        timestamp: 0
    };
    var avg = 0;
    var avgCount = 0;

    min.min = data[0].data[0];
    max.max = data[0].data[0];

    for (var i = 0; i < data.length; i++) {

        var sensorReport = data[i];

        for (var j = 0; j < sensorReport.data.length; j++) {

            var temperature = sensorReport.data[j];

            avg = avg + temperature;

            if (temperature > max.max) {
                max.max = temperature;
                max.timestamp = sensorReport.timestamp;
            }

            if (temperature < min.min) {
                min.min = temperature;
                min.timestamp = sensorReport.timestamp;
            }

            avgCount++;
        }

    }

    //console.log("avg Count" + avgCount);

    avg = avg / avgCount;

    ret.avgForPeriod = avg;
    ret.minForPeriod = min.min;
    ret.maxForPeriod = max.max;
    ret.minTimestamp = min.timestamp;
    ret.maxTimestamp = max.timestamp;

    return ret;
}



















