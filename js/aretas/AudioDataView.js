class AudioUtil {

    constructor(AAI) {
        this._AAI = AAI;
        this._context = null;
    }

    soundInit() {

        if (!window.AudioContext) {

            if (!window.webkitAudioContext) {
                console.warn("Your browser does not support any AudioContext and cannot play back this audio.");
                return;
            }
            window.AudioContext = window.webkitAudioContext;
        }

        this._context = new AudioContext();
    }

    playByteArray(byteArray) {

        if (this._context == null) {
            console.error("playByteArray: Initialize audio context first...");
            return;
        }

        let arrayBuffer = new ArrayBuffer(byteArray.length);

        let bufferView = new Uint8Array(arrayBuffer);
        for (i = 0; i < byteArray.length; i++) {
            bufferView[i] = byteArray[i];
        }

        //console.log("byteArray:" + byteArray);

        this._context.decodeAudioData(arrayBuffer, function (buffer) {

            play(buffer);

        }, function (error) {
            console.error("decode Audio Data:");
            console.error(error);
        });
    }

    /**
     * Play a buffer of audio data
     * @param {*} buf 
     * @returns 
     */
    play(buf) {

        if (this._context == null) {
            console.error("play: Initialize audio context first...");
            return;
        }

        // Create a source node from the buffer
        let source = this._context.createBufferSource();
        source.buffer = buf;
        // Connect to the final output node (the speakers)
        source.connect(this._context.destination);
        // Play immediately
        source.start(0);
    }
}
class AudioDataView {

    constructor(AAI, offsetData = false) {
        this._AAI = AAI;
        this._AudioUtil = new AudioUtil();
        this._AudioUtil.soundInit();
        this._offsetData = offsetData;
    }

    /**
     * 
     * Construct the "audio" analytics interface with the fetched data
     * 
     * AudioDataReport contains an array of AudioData objects which look like:
     * 
     * AudioData = {
     * 
     *  ADCMaxVal: 1023 //the maximum ADC value
     *  FFTData: Array() //likely an array in power of 2 length and probably 512 containing the mag values of the FFT
     *  SPLRef: -1 //the SPL reference value in dB, -1 if not set
     *  SPLRefADCValue: -1 //the SPL reference ADC value, -1 if not set
     *  dominants: Array() //an array of dominant frequencies
     *  sampleData: Array() //the raw ADC sampled data - likely in 10-bit precision contained in a 16-bit signed int (15-bits of magnitude)
     *  sampleRate: unsigned long //the sample rate of the sampled audio
     * 
     * }
     * 
     * @param {*} AudioDataReport 
     * 
     */
    createAudioViz(AudioDataReport, domTarget) {

        $(domTarget).empty();

        //console.log(data);
        let sensorTypeInfo = this._AAI.getSensorTypeInfo(parseInt(AudioDataReport[0].type));

        console.log("LABEL:" + sensorTypeInfo.label);

        let tabContentDiv = document.createElement("div");
        tabContentDiv.setAttribute("class", "audio-analytics"); //this one needs to be wider
        tabContentDiv.setAttribute("id", "tab-vis-content-audio");

        let hd = document.createElement("H3");
        hd.setAttribute("class", "text-primary");
        hd.append(sensorTypeInfo.label);
        hd.append("  ");

        let hdSpan = document.createElement("span");
        hdSpan.setAttribute("class", "badge badge-secondary");
        hdSpan.append("(" + sensorTypeInfo.type + ")");
        hd.append(hdSpan);

        tabContentDiv.append(hd);

        let dv = document.createElement("div");
        dv.setAttribute("class", "container");
        dv.setAttribute("id", "tab-vis-content-audio");

        let graphAudioFFT = document.createElement("div");
        graphAudioFFT.setAttribute("id", "viz-audio-FFT");
        graphAudioFFT.setAttribute("class", "col");

        $(graphAudioFFT).append("<span class=\"block-title\">FFT Analysis</span>");

        let graphAudioFFTCanvas = document.createElement("canvas");
        graphAudioFFTCanvas.setAttribute("id", "viz-audio-FFT-canvas");
        graphAudioFFTCanvas.setAttribute("class", "chart-canvas");
        graphAudioFFT.append(graphAudioFFTCanvas);

        let graphAudioWaveform = document.createElement("div");
        graphAudioWaveform.setAttribute("id", "viz-audio-waveform");
        graphAudioWaveform.setAttribute("class", "col");

        $(graphAudioWaveform).append("<span class=\"block-title\">Waveform Analysis</span>");

        let graphAudioWaveformCanvas = document.createElement("canvas");
        graphAudioWaveformCanvas.setAttribute("id", "viz-audio-waveform-canvas");
        graphAudioWaveformCanvas.setAttribute("class", "chart-canvas");
        graphAudioWaveform.append(graphAudioWaveformCanvas);

        let graphAudioPlotly3D = document.createElement("div");
        graphAudioPlotly3D.setAttribute("id", "viz-audio-plotly3D");
        graphAudioPlotly3D.setAttribute("class", "col");

        let graphSPLDiv = document.createElement("div");
        graphSPLDiv.setAttribute("id", "viz-spl-trend");
        graphSPLDiv.setAttribute("class", "col");
        $(graphSPLDiv).append("<span class=\"block-title\">SPL Chart</span>");

        let gaugeSPLDiv = document.createElement("div");
        gaugeSPLDiv.setAttribute("id", "viz-gauge-spl");
        gaugeSPLDiv.setAttribute("class", "col-md-auto");
        $(gaugeSPLDiv).append("<span class=\"block-title\">SPL Gauge</span>");

        let row1 = document.createElement("div");
        row1.setAttribute("class", "row");

        let row2 = document.createElement("div");
        row2.setAttribute("class", "row");


        let container = document.createElement("div");
        container.setAttribute("class", "container");

        let row3 = document.createElement("div");
        row3.setAttribute("class", "row");

        row1.append(graphAudioFFT);
        row1.append(graphAudioWaveform);
        row2.append(graphAudioPlotly3D);
        row3.append(graphSPLDiv, gaugeSPLDiv);
        container.append(row3);
        dv.append(row1, row2);

        tabContentDiv.append(dv, container);

        $(domTarget).append(tabContentDiv);

        //createVisSurfacePlot(AudioDataReport, graphAudio3D);
        this.createPlotlyViz(AudioDataReport, graphAudioPlotly3D);
        this.getSPLChart(AudioDataReport, graphSPLDiv);
        this.getSPLDashboard(AudioDataReport, gaugeSPLDiv);

        let ctx = $("#viz-audio-FFT-canvas");

        let scatterChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [],
            },
            options: {
                tooltips: {
                    enabled: false
                },
                animation: {
                    duration: 0
                },
                maintainAspectRatio: false,
                cubicInterpolationMode: 'monotone',
                scales: {
                    xAxes: [{
                        type: 'logarithmic',
                        position: 'bottom',
                        //format the labels on the chart (timestamps to nice formatted time string)
                        ticks: {
                            callback: function (value, index, values) {
                                return AudioDataView.getFreq(value);
                            }
                        },
                        gridLines: {
                            color: "#999999"
                        }
                    }],
                    yAxes: [{
                        type: 'linear',
                        display: true,
                        ticks: {
                            beginAtZero: true,
                            stepValue: 5,
                            max: 512,
                            suggestedMax: 512
                        },
                        gridLines: {
                            color: "#999999"
                        }
                    }]

                }
            }
        });

        let ctx2 = $("#viz-audio-waveform-canvas");
        let waveformChart = new Chart(ctx2, {
            type: 'line',
            data: {
                datasets: [],
            },
            options: {
                tooltips: {
                    enabled: false
                },
                animation: {
                    duration: 10
                },
                maintainAspectRatio: false,
                cubicInterpolationMode: 'monotone',
                scales: {
                    xAxes: [{
                        type: 'linear',
                        position: 'bottom',
                        //format the labels on the chart (timestamps to nice formatted time string)
                        ticks: {
                            callback: function (value, index, values) {
                                return value + "ms";
                            }
                        },
                        gridLines: {
                            color: "#999999"
                        }
                    }],
                    yAxes: [{
                        display: true,
                        ticks: {
                            beginAtZero: false,
                            steps: 10,
                            stepValue: 5,
                            max: 512,
                            min: -512
                        },
                        gridLines: {
                            color: "#999999"
                        }
                    }]

                }
            }
        });

        this.animateSpectrumChart(AudioDataReport, scatterChart, sensorTypeInfo.sensorColor.replace("0x", "#"), sensorTypeInfo.label);
        this.animateWaveformChart(AudioDataReport, waveformChart, sensorTypeInfo.sensorColor.replace("0x", "#"), sensorTypeInfo.label);

        let btnAudioPlay = document.createElement("button");
        btnAudioPlay.setAttribute("class", "btn btn-primary");
        btnAudioPlay.append("Download Wav File");

        btnAudioPlay.onclick = function () {

            console.log("playing audio...");

            let audioData = Array();

            for (let n = 0; n < AudioDataReport.length; n++) {

                dataToAppend = AudioDataReport[n].sampleData;

                for (let o = 0; o < dataToAppend.length; o++) {

                    audioData.push(dataToAppend[o]);

                }

            }

            this._AudioUtil.playByteArray(audioData);

        };

        domTarget.append(btnAudioPlay);
    }

    static getFreq(value) {
        return value + "Hz";
    }

    async getLatestReport(mac, onReceiveLatestReadings) {

        try {

            let data = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + this._AAI.bearerToken);
                },
                contentType: "application/json",
                dataType: "json",
                type: "POST",
                url: ASNAPIURL + "sensorreport/latest",
                data: JSON.stringify([mac]),

            });

            onReceiveLatestReadings(mac, data);
            return data;

        } catch (error) {

            console.log("failed to get latest readings");
            console.log(data);

        } finally {

        }

    }

    async getSPLChart(AudioDataReport, splChartDomTarget) {

        let start = AudioDataReport[0].timestamp;
        let end = AudioDataReport[AudioDataReport.length - 1].timestamp;
        let mac = AudioDataReport[0].mac;

        let classThis = this;

        try {

            //query the data for these sensors
            let sensorData = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
                },
                dataType: "json",
                type: "GET",
                url: ASNAPIURL + "sensordata/byrange",
                data: {
                    mac: mac,
                    begin: start,
                    end: end,
                    limit: 1000000,
                    offsetData: classThis._offsetData,
                },
            });

            this.createSPLChart(sensorData, splChartDomTarget);

            return sensorData;

        } catch (error) {

            console.log("failed to get sensor data for that sensor");
            console.log(error);

        }

    }

    getSPLDashboard(AudioDataReport, splGaugeDomTarget) {

        let start = AudioDataReport[0].timestamp;
        let end = AudioDataReport[AudioDataReport.length - 1].timestamp;
        let mac = AudioDataReport[0].mac;

        let classThis = this;

        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
            },
            dataType: "json",
            type: "GET",
            url: ASNAPIURL + "dashboard/monitorstats",
            data: {
                mac: mac,
                start: start,
                end: end,
                sparkWindowSize: 50,
                offsetData: classThis._offsetData,
            },
            success: function (data) {
                $.each(data, function (index, dashboardStatsItem) {
                    if (dashboardStatsItem.type == 49) {
                        classThis.constructSPLGauge(dashboardStatsItem, splGaugeDomTarget);
                    }
                });
            },
            error: function (error) {
                console.error("failed to query dashboard monitor stats");
                console.error(error);
            }
        });

    }

    constructSPLGauge(dashboardStatsItem, domTarget) {

        let sensorTypeInfo = this._AAI.getSensorTypeInfo(parseInt(dashboardStatsItem.type));
        console.log("LABEL:" + sensorTypeInfo.label);

        let hd = document.createElement("H4");
        hd.setAttribute("class", "text-primary text-center");
        hd.append(sensorTypeInfo.label);
        hd.append("  ");

        let hdSpan = document.createElement("span");
        hdSpan.setAttribute("class", "badge badge-secondary");
        hdSpan.append("(" + dashboardStatsItem.type + ")");
        hd.append(hdSpan);

        domTarget.append(hd);

        let gaugeContainer = document.createElement("div");
        gaugeContainer.setAttribute("class", "container gauge-container");

        let hdAvg = document.createElement("h4");
        hdAvg.setAttribute("class", "text-center h4 bg-secondary text-nowrap text-white pl-3 pr-3 pt-1 pb-1 mr-1");
        hdAvg.append("Avg: " + dashboardStatsItem.avgForPeriod.toPrecision(5) + sensorTypeInfo.units);

        gaugeContainer.append(hdAvg);

        let canvas = document.createElement("canvas");
        canvas.setAttribute("id", "cv-gauge-" + dashboardStatsItem.type);
        canvas.setAttribute("class", "sensor-gauge");

        gaugeContainer.append(canvas);

        let minMaxDiv = document.createElement("div");
        minMaxDiv.setAttribute("class", "div-min-max");

        let spanMin = document.createElement("div");
        spanMin.setAttribute("class", "h4 bg-secondary text-nowrap text-white pl-3 pr-3 pt-1 pb-1 mr-1 d-inline-block");
        spanMin.append("Min: " + dashboardStatsItem.minForPeriod + sensorTypeInfo.units);

        let spanMax = document.createElement("span");
        spanMax.setAttribute("class", "h4 border-2 bg-secondary text-nowrap text-white pl-3 pr-3 pt-1 pb-1 ml-1 d-inline-block");
        spanMax.append("Max: " + dashboardStatsItem.maxForPeriod + sensorTypeInfo.units);

        minMaxDiv.append(spanMin, spanMax);

        gaugeContainer.append(minMaxDiv);
        domTarget.append(gaugeContainer);

        let ul1 = document.createElement("ul");
        ul1.setAttribute("class", "list-group");

        let li1 = document.createElement("li");
        li1.innerHTML = "Highest recorded <span class=\"font-italic\">" +
            sensorTypeInfo.label + "</span> was on " + formatDate(dashboardStatsItem.maxTimestamp);
        li1.setAttribute("class", "list-group-item");

        let li2 = document.createElement("li");
        li2.innerHTML = "Lowest recorded <span class=\"font-italic\">" + sensorTypeInfo.label +
            "</span> was on " + formatDate(dashboardStatsItem.minTimestamp);
        li2.setAttribute("class", "list-group-item");

        let li3 = document.createElement("li");
        li3.append(dashboardStatsItem.recommendation);
        li3.setAttribute("class", "list-group-item");

        let sparkSpan = document.createElement("span");
        sparkSpan.setAttribute("id", "spark-span-" + dashboardStatsItem.type);
        sparkSpan.setAttribute("class", "sparkline-chart-span");
        ul1.append(li1);
        ul1.append(li2);
        ul1.append(li3);

        domTarget.append(ul1);
        domTarget.append(sparkSpan);

        $("#spark-span-" + dashboardStatsItem.type).sparkline(dashboardStatsItem.sparklineData, {
            height: 60,
            width: "100%",
            lineColor: "#ffffff",
            fillColor: sensorTypeInfo.sensorColor.replace("0x", "#")
        });

        let opts = {

            angle: 0.01, // The span of the gauge arc
            lineWidth: 0.5, // The line thickness
            radiusScale: 1, // Relative radius
            pointer: {
                length: 0.6, // // Relative to gauge radius
                strokeWidth: 0.035, // The thickness
                color: '#505050' // Fill color
            },
            staticZones: this._AAI.getGaugeStaticZones(dashboardStatsItem.type),
            staticLabels: {
                font: "12pt sans-serif", // Specifies font
                labels: [dashboardStatsItem.avgForPeriod], // Print labels at these values
                color: "#505050", // Optional: Label text color
                fractionDigits: 2 // Optional: Numerical precision. 0=round off.
            },
            limitMax: false, // If false, max value increases automatically if value > maxValue
            limitMin: false, // If true, the min value of the gauge will be fixed
            colorStart: '#6FADCF', // Colors
            colorStop: '#8FC0DA', // just experiment with them
            strokeColor: '#E0E0E0', // to see which ones work best for you
            generateGradient: true,
            highDpiSupport: true, // High resolution support
            renderTicks: {
                divisions: 6,
                divWidth: 1.0,
                divLength: 0.25,
                divColor: '#ffffff',
                subDivisions: 3,
                subLength: 0.10,
                subWidth: 0.6,
                subColor: '#cccccc'
            }
        };

        let gauge = new Gauge(canvas).setOptions(opts);
        gauge.maxValue = 190; // set max gauge value
        gauge.setMinValue(0); // Prefer setter over gauge.minValue = 0
        gauge.animationSpeed = 32; // set animation speed (32 is default value)
        gauge.set(dashboardStatsItem.avgForPeriod); // set actual value

    }

    createSPLChart(data, splChartDomTarget) {

        let datasets = new Map();
        let i = 0;
        let typeReadings;
        let mac = 0;

        for (i = 0; i < data.length; i++) {

            let reading = data[i];
            mac = reading.mac; //waste of cycles.. 
            if (datasets.has(reading.type)) {
                typeReadings = datasets.get(reading.type);
            } else {
                typeReadings = new Array();
                datasets.set(reading.type, typeReadings);
            }

            let datum = {};
            datum.x = reading.timestamp;
            datum.y = reading.data;
            typeReadings.push(datum);
        }

        let ctx = document.createElement("canvas");
        ctx.setAttribute("id", "ctxFullChart");
        ctx.setAttribute("width", $('#viz-spl-trend').width() + "px");

        $(splChartDomTarget).append(ctx);

        let scatterChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [],
            },
            options: {
                tooltips: {
                    enabled: true,
                    mode: 'single',
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
                maintainAspectRatio: false,
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
                radius: 0,
                hitRadius: 3,
                hoverRadius: 3,
                label: sInfo.label,
                data: dataArr,
                showLine: true,
                fill: false,
                borderColor: [sInfo.sensorColor.replace("0x", "#")],
                cubicInterpolationMode: 'monotone',
                borderWidth: 1
            };
            scatterChart.data.datasets.push(dataSet);
            scatterChart.update();
        }

    }

    animateSpectrumChart(data, chartObj, borderColor, label) {

        let incr = 0;
        let pkFFT = 0;
        let pkDataSetIdx = 0;
        let pkDataSet = [];
    
        //we should also rescale the spectrum chart to the peak of the data so it looks better YEAH!
    
        //get the dataset with the peak magnitude / frequency
        for (let i = 0; i < data.length; i++) {
    
            let FFTData = data[i].FFTData;
    
            for (let j = 1; j < FFTData.length / 2; j++) {
                if (FFTData[j] > pkFFT) {
                    pkFFT = FFTData[j];
                    pkDataSetIdx = i;
                }
            }
            /**
            tmpFFTAvg = tmpFFTAvg / FFTData.length;
    
            if(tmpFFTAvg > pkFFTAvg){
                pkFFTAvg = tmpFFTAvg;
                pkDataSetIdx = i;
            }
            */
    
        }
    
        pkDataSet = data[pkDataSetIdx].FFTData;
    
        let spanCt = document.createElement("span");
        spanCt.setAttribute("class", "badge badge-primary");
        spanCt.append("Dominant Frequencies:");
    
        let spanFreq = document.createElement("span");
        spanFreq.setAttribute("class", "badge badge-info");
    
        console.log(data[pkDataSetIdx]);
    
        //get the dominants for that data
        for (let i = 0; i < data[pkDataSetIdx].dominants.length; i++) {
            spanFreq.append(data[pkDataSetIdx].dominants[i] + "Hz");
            if (i < data[pkDataSetIdx].dominants.length - 1) {
                spanFreq.append(",");
            }
        }
    
        $("#viz-audio-2D").append(spanCt, spanFreq);
    
        chartObj.options.scales.yAxes[0].ticks.max = pkFFT / 512;
        //console.log(chartObj.options);
    
        /**
         * The first bin in the FFT is DC (0 Hz), the second bin is Fs / N, where Fs is the sample rate and N is the size of the FFT.
         * The next bin is 2 * Fs / N. To express this in general terms, the nth bin is n * Fs / N.
         */
    
         let spectrumChartAnimationCtx = setInterval(function () {
    
            if (incr > data.length - 1) {
                incr = 0;
            }
    
            let dFFT = data[incr].FFTData;
            let FFTDataToChart = Array();
    
            for (let bb = 1; bb < dFFT.length / 2; bb++) {
    
                let datum = {};
                datum.x = bb * (data[incr].sampleRate / dFFT.length);
                datum.y = dFFT[bb] / (data[incr].ADCMaxVal / 2);
                FFTDataToChart.push(datum);
            }
    
            let pkFFTDataToChart = Array();
    
            for (let cc = 1; cc < pkDataSet.length / 2; cc++) {
    
                let datum = {};
                datum.x = cc * (data[incr].sampleRate / dFFT.length);
                datum.y = pkDataSet[cc] / (data[incr].ADCMaxVal / 2);
                pkFFTDataToChart.push(datum);
            }
    
            let dataSet = {
                label: label,
                radius: 0,
                data: FFTDataToChart,
                showLine: true,
                fill: false,
                borderColor: [borderColor],
                borderWidth: 1,
                cubicInterpolationMode: 'monotone'
            };
    
            let dataSetPk = {
                label: "Peak Dataset from:" + formatDate(data[pkDataSetIdx].timestamp),
                radius: 0,
                data: pkFFTDataToChart,
                showLine: true,
                fill: false,
                borderColor: ["Orange"],
                borderWidth: 1,
                cubicInterpolationMode: 'monotone'
            };
            //console.log(dataSet);
            chartObj.data.datasets = [];
            chartObj.data.datasets.push(dataSet);
            chartObj.data.datasets.push(dataSetPk);
            chartObj.update();
    
            incr++;
    
        }, 200);
    
    }

    animateWaveformChart(data, chartObj, borderColor, label) {

        let incr = 0;
    
        /**
        we want to get the peak waveform data and display it on top of the spectrum playback
        however, we may eventually want to get a few of the top waveforms to display
        this may become too intensive though as the sample size goes up...probably not really
        */
        let pkWvformAvg = 0;
        let avg = 0;
        let pkDataSetIdx = 0;
        let pkDataSet = [];
    
        //we should also rescale the spectrum chart to the peak of the data so it looks better YEAH!
    
        //get the dataset with the peak average voltage
        for (let i = 0; i < data.length; i++) {
    
            let WaveformData = data[i].sampleData;

            let j;
    
            for (j = 0; j < WaveformData.length; j++) {
    
                let sample = WaveformData[j];
                //rectify it
                if (sample < 0) {
                    sample = -sample;
                }
                avg += sample;
            }
    
            //rectified sample average
            avg = avg / j;
            if (avg > pkWvformAvg) {
                pkWvformAvg = avg;
                avg = 0;
                pkDataSetIdx = i;
            }
    
        }
    
        pkDataSet = data[pkDataSetIdx].sampleData;
    
        let waveformChartAnimationCtx = setInterval(function () {
    
            if (incr > data.length - 1) {
                incr = 0;
            }
    
            //seed the chart with the first FFT
            let sampleData = data[incr].sampleData;
            let sampleRate = data[incr].sampleRate;
            let sampleDataData = Array();
    
            for (let bb = 0; bb < sampleData.length; bb++) {
    
                let datum = {};
                datum.x = bb * ((1 / sampleRate) * 1000);
                datum.y = sampleData[bb];
                sampleDataData.push(datum);
            }
    
            let pkWaveDataToChart = Array();
    
            for (let cc = 0; cc < pkDataSet.length; cc++) {
    
                let datum = {};
                datum.x = cc * ((1 / sampleRate) * 1000);
                datum.y = pkDataSet[cc];
                pkWaveDataToChart.push(datum);
            }
    
            let dataSet = {
                label: label,
                radius: 0,
                data: sampleDataData,
                showLine: true,
                fill: false,
                borderColor: [borderColor],
                borderWidth: 1,
                cubicInterpolationMode: 'monotone'
            };
    
            let dataSetPk = {
                label: "Peak Dataset from:" + formatDate(data[pkDataSetIdx].timestamp),
                radius: 0,
                data: pkWaveDataToChart,
                showLine: true,
                fill: false,
                borderColor: ["Orange"],
                borderWidth: 1,
                cubicInterpolationMode: 'monotone'
            };
            //console.log(dataSet);
            chartObj.data.datasets = [];
            chartObj.data.datasets.push(dataSet);
            chartObj.data.datasets.push(dataSetPk);
            chartObj.update();
    
            incr++;
    
        }, 200);
    
    }
    
    createPlotlyViz(AudioDataReport, domTarget) {
    
        /** do the plotly vis **/
        let z_data = [];
    
        for (let ee = 0; ee < AudioDataReport.length; ee++) {
            let FFTArr = Array();
            for (let ff = 0; ff < AudioDataReport[ee].FFTData.length / 2; ff++) {
                FFTArr.push(AudioDataReport[ee].FFTData[ff] / (AudioDataReport[ee].FFTData.length / 2));
            }
            z_data.push(FFTArr);
        }
    
        let plotlyData = [{
            z: z_data,
            type: 'surface'
        }];
    
        let plotlyLayout = {
            title: 'Spectral Data',
            autosize: false,
            width: $(domTarget).width(),
            height: $(domTarget).height(),
            margin: {
                l: 20,
                r: 20,
                b: 20,
                t: 40
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            scene: {
                //aspectmode:'data',
                //aspectratio:'data',
                camera: {
                    up: {
                        x: 0,
                        y: 0,
                        z: 1
                    },
                    eye: {
                        x: "0.0625",
                        y: "-2.1268",
                        z: "0.17"
                    }
                },
                xaxis: {
                    title: 'Frequency',
                    titlefont: {
                        family: 'Courier New, monospace',
                        size: 18,
                        color: '#7f7f7f'
                    }
                },
                yaxis: {
                    title: 'Time',
                    titlefont: {
                        family: 'Courier New, monospace',
                        size: 18,
                        color: '#7f7f7f'
                    }
                },
                zaxis: {
                    title: 'Amplitude',
                    titlefont: {
                        family: 'Courier New, monospace',
                        size: 18,
                        color: '#7f7f7f'
                    }
                }
            }
        };
        let plotly = Plotly.newPlot(domTarget, plotlyData, plotlyLayout, {
            modeBarButtonsToRemove: ['sendDataToCloud'],
            displayModeBar: false
        });
    
    }
    
    createVisSurfacePlot(AudioDataReport, domTarget) {
    
        //we need to decimate the data for this chart type
    
        // Create and populate a data table.
        let dataV = new vis.DataSet();
    
        //insert the data for one surface 
        let dataToChart;
        //console.log(dataToChart);
    
        let counter = 0;
    
        for (let n = 0; n < AudioDataReport.length; n++) {
    
            dataToChart = AudioDataReport[n].FFTData; //get a reference to the 
    
            //console.log(dataToChart);
    
            for (let o = 0; o < dataToChart.length / 2; o++) {
    
                //frequency = index * sampleRate/FFT_N
                let frequency = o * AudioDataReport[n].sampleRate / dataToChart.length;
                let timestamp = AudioDataReport[n].timestamp;
                let mag = dataToChart[o] / AudioDataReport[n].sampleData.length;
    
                //dataV.add({id:counter++,x:frequency,y:timestamp, z:mag, style:dataToChart[o]});
                dataV.add({
                    id: counter++,
                    x: Math.log(o + 1) * 100,
                    y: (n * 10),
                    z: dataToChart[o] / (AudioDataReport[n].sampleData.length / 2),
                    style: dataToChart[o]
                });
            }
    
        }
    
        // specify options
        let options = {
            width: $(domTarget).width() + "px",
            height: "400px",
            style: 'surface',
            showPerspective: false,
            showGrid: true,
            showShadow: false,
            keepAspectRatio: false,
            verticalRatio: 0.5,
            zMax: AudioDataReport[0].ADCMaxVal / 2 / 2,
            zLabel: "Amplitude",
            yLabel: "Time",
            xLabel: "Frequency"
            //showAnimationControls: true
        };
    
        let graph = new vis.Graph3d(domTarget, dataV, options);
        //done with 3D
        console.log("done with 3D");
    
    }
}





