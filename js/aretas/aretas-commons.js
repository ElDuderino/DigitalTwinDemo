const METHOD = location.protocol;

//the remote host for the REST API
const RHOST = "10.0.0.8:8080";

const ASNHTMLURL = METHOD + "//" + RHOST + "/html/";
const ASNAPIURL = METHOD + "//" + RHOST + "/rest/";

var LOCATION_WS_ENDPOINT = "ws://" + RHOST + "/locationevents/";
if (METHOD == "https:") {
    LOCATION_WS_ENDPOINT = "wss://" + RHOST + "/locationevents/";
}

var SENSORDATA_WS_ENDPOINT = "ws://" + RHOST + "/sensordataevents/";
if (METHOD == "https:") {
    SENSORDATA_WS_ENDPOINT = "wss://" + RHOST + "/sensordataevents/";
}

var LOCATIONEVENTS_WS_ENDPOINT = "ws://" + RHOST + "/rtlsevents/";
if (METHOD == "https:") {
    LOCATIONEVENTS_WS_ENDPOINT = "wss://" + RHOST + "/rtlsevents/";
}
var brandTxt = "Aretas";

/**
 * This is the main hook that checks for any 401 messages from the API and detects if the user is not logged in
 * We then launch the login modal that should be present on all pages
 */
$(document).ajaxError(function (event, jqxhr, settings, exception) {
    if (jqxhr.status == 401) {
        console.log("Looks like you are not logged into the API");
        //launch the login modal that logs us in and gets the bearer token
        doLogin();
    }
});

jQuery.fn.filterByText = function (textbox) {

    return this.each(function () {
        let select = this;
        let options = [];
        $(select).find('option').each(function () {
            options.push({
                value: $(this).val(),
                text: $(this).text()
            });
        });
        $(select).data('options', options);

        $(textbox).bind('change keyup', function () {
            let options = $(select).empty().data('options');
            let search = $.trim($(this).val());
            let regex = new RegExp(search, "gi");

            $.each(options, function (i) {
                let option = options[i];
                if (option.text.match(regex) !== null) {
                    $(select).append(
                        $('<option>').text(option.text).val(option.value)
                    );
                }
            });
        });
    });
};

/**
 * This is the main app entry point and should be called on the DOMContentLoaded event
 * at the top of every page
 * @returns 
 */
async function aretas_init() {

    console.log("ARETAS INIT");

    //this attempts to update the top nav with the active link by current page 
    updateActiveNav();

    /**
     * Render the *included* html elements (login form, modals, etc)
     */
    await includeHtmlFetch();

    let aretasApp = new AretasAppInstance();
    await aretasApp.aretasInitFunc();

    /**
     * Allow someone to hit enter to login
     */
    $('#login-frm-pass').keypress(function (e) {
        if (e.which == 13) {
            login();
        }
    });

    /** make sure the login modal exists on all pages */
    $('#btn-login').click(function () {
        login();
    });

    $('#btn-logout').click(function () {

        let token = Cookies.get("X-Aretas-Bearer");

        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + token);
            },
            dataType: "json",
            contentType: "application/json",
            type: "POST",
            data: token,
            url: ASNAPIURL + "authentication/logout",
            success: function (data) {
                console.log("Logged out");
                Cookies.remove("X-Aretas-Bearer");
                location.reload();
            },
            error: function (data) {
                console.log(data);
                bootbox.alert("Could not log out");
            }
        });
    });

    return aretasApp;

}

/**
 * Change the title for other white labelers
 */
function brandTitle() {
    document.title = document.title.replace("Aretas", brandTxt);
}

/**
 * Make sure the login modal is included on all pages using the include-html feature
 *
 */
function doLogin() {
    $('#modalLoginForm').modal('show');
}

function login() {

    console.log("Logging in..");

    //get a bearer token with the provided login credentials
    $.ajax({
        dataType: "text",
        contentType: "application/json",
        type: "POST",
        url: ASNAPIURL + "authentication/j",
        data: JSON.stringify({
            username: $('#login-frm-username').val(),
            password: $('#login-frm-pass').val()
        }),
        success: function (data) {
            Cookies.set('X-Aretas-Bearer', data);
            $('#modalLoginForm').modal('hide');
            location.reload();
        },
        error: function (data) {
            console.log(data);
            $('#modalLoginForm').modal('hide');
            bootbox.alert("Could not log you in, please try again", function () {
                location.reload();
            });

        }
    });

}

/**
 * Helper function to get the option content for sensor location lists
 * @param {*} sensorLocation 
 * @param {*} selected 
 * @returns 
 */
function getSensorLocationListOption(sensorLocation, selected) {

    var opt = document.createElement("option");
    opt.setAttribute("value", sensorLocation.id);
    if (sensorLocation.hasOwnProperty("lastReportTime")) {

        opt.setAttribute("class", getBackgroundClassByLastReportTime(sensorLocation.lastReportTime));
        opt.setAttribute("title", "Sensor Last Reported " + moment(sensorLocation.lastReportTime).format());
        if (selected == true) {
            opt.setAttribute("selected", true);
        }

    }
    opt.append(sensorLocation.description);

    return opt;

}

/**
 * Set the background class / color for a device based on the last report time
 * Essentially, we want devices that haven't reported in a long time to be "warning" color
 * So a user can quickly locate them visually 
 * 
 * @param {*} timestamp 
 * @returns 
 */
function getBackgroundClassByLastReportTime(timestamp) {

    var now = new Date();

    if ((now - timestamp) < 5 * 60 * 1000) { //5 mins

        return "bg-success text-white";
    }

    if ((now - timestamp) < 30 * 60 * 1000) { //30 mins
        return "bg-primary text-white";
    }

    if ((now - timestamp) < 24 * 60 * 1000) { //24 hrs
        return "bg-warning text-white";
    }

    return "bg-nodata text-white";

}




/**
 * we get an array of JSON objects like:
 * [{
 *  location: {
 *      description: blah
 *      mac: blah
 *  }
 *  buildingmaps: {
 *  }, 
 *  {
 *  location: {
 *      description, blah, 
 *      mac: blah}
 *  buildingmaps: {
 *  }
 * }
 * }]
 * 
 * therefore we need so sort by location.description (or city, whatever)
 * so we'll take in an optional subproperty 
 * Function to sort alphabetically an array of objects by some specific key.
 * 
 * @param {String} property Key of the object to sort.
 */
function dynamicSort(property, subproperty = null) {

    var sortOrder = 1;

    if (subproperty == null) {

        if (property[0] === "-") {
            sortOrder = -1;
            property = property.substr(1);
        }

        return function (a, b) {

            if (a.hasOwnProperty(property) && b.hasOwnProperty(property)) {
                if (sortOrder == -1) {
                    return b[property].localeCompare(a[property]);
                } else {
                    return a[property].localeCompare(b[property]);
                }
            }

        };

    }

    if (subproperty[0] === "-") {
        sortOrder = -1;
        subproperty = subproperty.substr(1);
    }

    return function (a, b) {
        if (sortOrder == -1) {
            return b[property][subproperty].localeCompare(a[property][subproperty]);
        } else {
            return a[property][subproperty].localeCompare(b[property][subproperty]);
        }
    };
}

/**
 * 
 * sort on a numeric property name, but check for the existence of the property by name
 * returns a function that returns 0 if the property does not exist 
 * the function otherwise performs a regular numeric sort
 * 
 * @param {*} property 
 */
function sortNumericProperty(property, reverse = false) {

    return function (a, b) {

        if (a.hasOwnProperty(property) && b.hasOwnProperty(property)) {

            aNum = parseFloat(a[property]);
            bNum = parseFloat(b[property]);

            if (reverse == true) {
                return bNum - aNum;
            } else {
                return aNum - bNum;
            }

        } else {
            return 0;
        }
    };

}

/**
 * render a building map select dropdown
 * @param {select} domElement 
 * @param {*} buildingMapList 
 */
function renderBuildingMapSelect(domElement, buildingMapList) {

    $(domElement).empty();

    const firstoption = document.createElement("option");
    firstoption.setAttribute("disabled", true);
    firstoption.setAttribute("selected", true);
    firstoption.append("Choose a building map:");

    domElement.append(firstoption);

    for (const buildingMap of buildingMapList) {

        const opt = document.createElement("option");
        opt.setAttribute("value", buildingMap.id);
        opt.append(buildingMap.description);
        domElement.append(opt);

    }

}
/**
 * renders options into an empty <select> dom element
 * color codes the locations based on last report time
 * uses the pre-populated clientLocationView object in memory
 * 
 * @param {HTML SELECT} domElement 
 */
function renderLocationSelect(domElement, AAI) {

    domElement.innerHTML = "";

    let hasLocation = false;

    let selectedVal = null;

    for (locationSensorView of AAI.clientLocationView.locationSensorViews) {

        //console.log(value);
        const opt = document.createElement("option");
        if (locationSensorView.hasOwnProperty("lastSensorReportTime")) {

            let diff = Date.now() - locationSensorView.lastSensorReportTime;

            if (diff < (60 * 60 * 1000)) {
                opt.setAttribute("class", "bg-success text-white");
            } else if (diff < (24 * 60 * 60 * 1000)) {
                opt.setAttribute("class", "bg-warning text-white");
            } else if (diff < (7 * 24 * 60 * 60 * 1000)) {
                opt.setAttribute("class", "bg-danger text-white");
            } else {
                opt.setAttribute("class", "text-secondary");
            }
        }
        opt.setAttribute("value", locationSensorView.location.id);
        opt.append(locationSensorView.location.description);


        if (AAI.clientLocationView.nearestLocationIdWithData != null) {

            if (
                AAI.clientLocationView.nearestLocationIdWithData == locationSensorView.location.id &&
                locationSensorView.hasOwnProperty('lastSensorReportTime') &&
                ((Date.now() - locationSensorView.lastSensorReportTime) < (10 * 60 * 60 * 1000))
            ) {

                domElement.value = locationSensorView.location.id;
                opt.setAttribute("selected", true);
                //@FIXME:
                //selectedLocationId = value.location.id;
                hasLocation = true;
            } else if (
                locationSensorView.hasOwnProperty('lastSensorReportTime') &&
                ((Date.now() - locationSensorView.lastSensorReportTime) < (10 * 60 * 60 * 1000))
            ) {
                domElement.value = locationSensorView.location.id;
                opt.setAttribute("selected", true);
                hasLocation = true;

            }

        }
        domElement.append(opt);

    }

}

/**
 * - renders an html select dom element with sensors / devices
 * - color codes them based on the last report time of the sensor
 * - uses the prepopulated clientLocationView global object for data
 * 
 * @param {HTML SELECT} domElement 
 * @param {*} sensorId 
 */
function renderSensorSelect(domElement, locationId, AAI) {

    let sensorList = AAI.getLocationSensorsByID(locationId);

    $(domElement).find('option').remove().end();

    $.each(sensorList, function (index, data) {

        //console.log(data);

        var opt = document.createElement("option");

        if (data.hasOwnProperty("lastReportTime")) {

            if (data.lastReportTime != 0) {
                let diff = Date.now() - data.lastReportTime;

                if (diff < (60 * 60 * 1000)) {
                    opt.setAttribute("class", "bg-success text-white");
                } else if (diff < (24 * 60 * 60 * 1000)) {
                    opt.setAttribute("class", "bg-warning text-white");
                } else if (diff < (7 * 24 * 60 * 60 * 1000)) {
                    opt.setAttribute("class", "bg-danger text-white");
                } else {
                    opt.setAttribute("class", "text-secondary");
                }
            }
        }
        opt.setAttribute("value", data.id);
        opt.append(data.description);
        $(domElement).append(opt);

    });

}

/**
 * render a select element with the locations / sensors all in one list with the locations as disabled options
 * @param {select} domElement 
 */
function renderSingleLevelLocationSensorSelect(domElement, AAI, filter = null) {

    $(domElement).empty();

    let hasLocation = false;

    let firstOpt = document.createElement("option");
    firstOpt.setAttribute("value", "");
    firstOpt.setAttribute("disabled", true);
    firstOpt.setAttribute("selected", true);
    firstOpt.append("Choose a sensor:");

    domElement.append(firstOpt);

    let secondOpt = document.createElement("option");
    secondOpt.setAttribute("value", "nil");
    secondOpt.append("None");

    domElement.append(secondOpt);

    for (const locationView of AAI.clientLocationView.locationSensorViews) {

        if (filter !== null) {
            //console.log("Filter:" + filter + " Location ID:" + value.location.id);
            if (locationView.location.id !== filter) {
                continue;
            }
        }

        //console.log(locationView);
        let opt = document.createElement("option");
        opt.setAttribute("value", locationView.location.id);
        opt.setAttribute("disabled", true);
        opt.append(locationView.location.description);
        opt.setAttribute("class", "bg-dark text-white");
        domElement.append(opt);

        let sensorList = AAI.getLocationSensorsByID(locationView.location.id);

        for (const sensor of sensorList) {

            let opt = document.createElement("option");

            if (sensor.hasOwnProperty("lastReportTime")) {

                if (sensor.lastReportTime != 0) {
                    let diff = Date.now() - sensor.lastReportTime;

                    if (diff < (60 * 60 * 1000)) {
                        opt.setAttribute("class", "bg-success text-white");
                    } else if (diff < (24 * 60 * 60 * 1000)) {
                        opt.setAttribute("class", "bg-warning text-white");
                    } else if (diff < (7 * 24 * 60 * 60 * 1000)) {
                        opt.setAttribute("class", "bg-danger text-white");
                    } else {
                        opt.setAttribute("class", "text-secondary");
                    }
                }
            }
            opt.setAttribute("value", sensor.id);
            opt.append(sensor.description);
            $(domElement).append(opt);

        }

    }



}


/**
 * creates a simple formatted date object for when other methods are overkill
 * @param {epoch timestamp} 
 */
function formatDate(d) {

    var dt = new Date(d);

    var ret = "";
    ret += dt.getHours();
    ret = ret + ":";
    ret = ret + ("0" + dt.getMinutes()).slice(-2);
    ret = ret + ":";
    ret = ret + ("0" + dt.getSeconds()).slice(-2);

    return ret;

}
/**
 * Only pushes the value onto the array if a similar value DOESN'T already exist
 * Prevents duplicate array values
 * @param {*} arr 
 * @param {*} value 
 */
function safeAdd(arr, value) {

    for (var i = 0; i < arr.length; i++) {
        if (arr[i] == value) {
            return true;
        }
    }

    arr.push(value);

    return false;
}
/**
 * Adds a function to extract a *key/value pair* value by keyname from the URL parameters
 */
$.urlParam = function (name) {

    var results = new RegExp('[\?&]' + name + '=([^]*)').exec(window.location.href);
    if (results == null) {
        return null;
    } else {
        return results[1].replace("\#", "") || 0;
    }
};

$.urlParam2 = function (sParam) {

    let searchURL = window.location.search.substring(1);
    let urlVars = searchURL.split('&');
    let ret = null;

    urlVars.forEach((urlVar) => {
        let varToK = urlVar.split('=');
        if (varToK[0] == sParam) {
            ret = varToK[1];
            return;
        }
    });

    return ret;
}

/**
 * Updates the nav bar html to highlight the right link based on what page the user is on
 */
function updateActiveNav() {

    brandTitle();

    //get the current html page
    const pathInfoArr = window.location.pathname.split("/");

    const page = pathInfoArr[pathInfoArr.length - 1];

    const querySelector = 'a[href=\"' + page + '\"]';
    const href = document.querySelectorAll(querySelector)[0];

    if (href) {

        const span = document.createElement("span");
        span.setAttribute("class", "sr-only");
        span.append("(current)");

        href.append(span);
        href.setAttribute("class", href.getAttribute("class") + " active");

        const parent = href.parentNode;
        parent.setAttribute("class", parent.getAttribute("class") + " active");

    }
}



/**
 * Updated function to fetch html snippets and add them to the DOM
 * If you need recursion ability (i.e. your includes have includes)
 * then use the old includeHTML() function
 * (or we can add recursion to this one and test)
 */
async function includeHtmlFetch() {

    let elements = document.querySelectorAll('[w3-include-html]');

    for (const element of elements) {

        let filename = element.getAttribute("w3-include-html");

        try {
            const htmlData = await fetch(filename).then((response) => response.text());
            element.innerHTML = htmlData;

        } catch (error) {
            element.innerHTML = "element fragment not found.";
        } finally {
            element.removeAttribute("w3-include-html");
        }
    }
}



/**
 * Get an object {statusTxt: xxxx, cssClass: xxxxxx} containing the status 
 * text description and css class for the text
 * @param {*} status 
 * @param {*} type 
 */
function getStatusColor(status, type) {

    var cssClass;
    var statusTxt;

    var ret = {};

    var P = new PCacheProtocol();

    switch (status.status) {

        case P.SENSOR_ALERT:

            //only set it red if this was the type 
            //of sensor that originally triggered the alert
            //if(data.sensorType == data.sensorStatus.sensorType) {

            //}

            if (status.type == type) {
                statusTxt = "Problem";
                cssClass = "sensor-problem";

            } else {
                statusTxt = "Normal";
                cssClass = "sensor-normal";
            }


            break;

        case P.SENSOR_DOWN:

            statusTxt = "Not Responding";
            cssClass = "sensor-not-responding";
            break;

        case P.SENSOR_IN_STRATEGY:

            statusTxt = "In Strategy";
            cssClass = "sensor-in-strategy";
            break;

        default:
        case P.SENSOR_OK:

            statusTxt = "Normal";
            cssClass = "sensor-normal";
            break;
    }

    ret.statusTxt = statusTxt;
    ret.cssClass = cssClass;

    return ret;
}

/**
 * A function to generate an html color string from an integer
 * @param {*} number 
 */
function getHexColor(number) {

    let template = "#000000";
    let htmlColor = number.toString(16);
    htmlColor = template.substring(0, 7 - htmlColor.length) + htmlColor;
    return htmlColor;
}

/**
 * Pass in a background html color string and you get the font color (white or black) 
 * that contrasts best with the background color for readability
 * @param {*} htmlColorStr 
 */
function getContrastingFontColor(htmlColorStr) {

    let color = {};

    if (htmlColorStr.length < 7) {
        console.debug("Incorrect length for HTML Color string");
        return;
    }

    color.R = htmlColorStr.substring(1, 3);
    color.R = "0x" + color.R;

    color.G = htmlColorStr.substring(3, 5);
    color.G = "0x" + color.G;

    color.B = htmlColorStr.substring(5);
    color.B = "0x" + color.B;

    color.R = parseInt(color.R);
    color.G = parseInt(color.G);
    color.B = parseInt(color.B);

    let d = 0;

    // Counting the perceptive luminance - human eye favors green color... 
    let luminance = (0.299 * color.R + 0.587 * color.G + 0.114 * color.B) / 255;

    if (luminance > 0.5) {
        //d = 0; // bright colors - black font
        d = "#000000";
    } else {
        //d = 255; // dark colors - white font
        d = "#FFFFFF";
    }
    return d;
    //For reference...
    //return  Color.FromArgb(d, d, d);

}
/**
 * Pass in an RGB or HTML color and an amount you want to lighten or darken it by
 * Will return back a color string in the same format
 * @param {*} col 
 * @param {*} amt 
 * @returns 
 */
function LightenDarkenColor(col, amt) {

    let usePound = false;

    if (col[0] == "#") {
        col = col.slice(1);
        usePound = true;
    }

    let num = parseInt(col, 16);

    let r = (num >> 16) + amt;

    if (r > 255) r = 255;
    else if (r < 0) r = 0;

    let b = ((num >> 8) & 0x00FF) + amt;

    if (b > 255) b = 255;
    else if (b < 0) b = 0;

    let g = (num & 0x0000FF) + amt;

    if (g > 255) g = 255;
    else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);

}
/**
 * Converts a hex / html color to an rgba  or rgba string
 * 
 * @param {*} hex 
 * @param {*} alpha 
 */
function hexToRGB(hex, alpha) {

    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);

    if (alpha) {
        return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    } else {
        return "rgb(" + r + ", " + g + ", " + b + ")";
    }
}
/**
 * utility function to generate a consistent palette select/options
 */
function getPaletteSelect() {

    const select = document.createElement("select");
    select.setAttribute("placeholder", "Choose a color palette");
    select.setAttribute("class", "form-control form-control-sm form-select-sm");

    const opt1 = document.createElement("option");
    opt1.setAttribute("value", "0");
    opt1.append("Thermal Ops");

    const opt2 = document.createElement("option");
    opt2.setAttribute("value", "1");
    opt2.append("Ice Lime");

    const opt3 = document.createElement("option");
    opt3.setAttribute("value", "2");
    opt3.append("Burnt Titanium");

    const opt4 = document.createElement("option");
    opt4.setAttribute("value", "3");
    opt4.append("Copper Gold");

    const opt5 = document.createElement("option");
    opt5.setAttribute("value", "4");
    opt5.append("Visual Spectrum");

    select.append(opt1, opt2, opt3, opt4, opt5);

    select.value = '4';

    return select;
}

/**
 * we should migrate this to a modal js file eventually
 * requires modal/modalSensorLatestStats modal to be included
 * @TODO: refactor this to use the cache
 * 
 * @sensorItem A SensorLocation object from the clientLocationView
 */
function popupLatestData(sensorItem, displaySparkline = true) {

    console.log("Getting latest data for: " + sensorItem.description);

    /**
     * Disable all of the other popup links while loading
     */
    const collection = document.getElementsByClassName("popup-mac-btn");

    for (let i = 0; i < collection.length; i++) {
        let node = collection.item(i);
        node.disabled = true;
    }
    $('#loader-sm').show();

    $('#statsModalTable > tbody').empty();
    $("#statsModalContentLinks").empty();

    const jsonStr = JSON.stringify([sensorItem.mac]);

    //get the latest data and add it to the statsModal for that object
    $.ajax({
        beforeSend: function (xhr) {
            xhr.setRequestHeader('Authorization', "Bearer " + AAI.bearerToken);
        },
        contentType: "application/json",
        dataType: "json",
        type: "POST",
        url: ASNAPIURL + "sensorreport/latest",
        data: jsonStr,
        success: function (data) {
            console.log("Success");

            $('#modalSensorLatestStats').modal('show');

            if (data.length == 0) {
                bootbox.alert("There was no data available for that sensor");
                return;
            } else {

                let br1 = document.createElement("br");
                let br2 = document.createElement("br");

                let label = document.createElement("label");
                label.setAttribute("class", "h6");
                label.append(sensorItem.description + " MAC:" + sensorItem.mac);

                let btnGroup = document.createElement("div");
                btnGroup.setAttribute("class", "btn-group p-1");

                let href1 = document.createElement("a");
                href1.setAttribute("class", "btn btn-primary btn-sm");
                let href2 = document.createElement("a");
                href2.setAttribute("class", "btn btn-primary btn-sm");

                href1.setAttribute("href", "analytics.html?mac=" + sensorItem.mac);
                href2.setAttribute("href", "sensor.html?mac=" + sensorItem.mac);
                href1.append("Charts / Analytics");
                href2.append("Monitor Dashboard");

                btnGroup.append(href1, href2);

                $("#statsModalContentLinks").append(label, btnGroup);

                let startPlaceholder = null;

                $.each(data, function (index, sensorData) {

                    let tr = document.createElement("tr");
                    let td1 = document.createElement("td");
                    let td2 = document.createElement("td");
                    let td3 = document.createElement("td");
                    let td4 = document.createElement("td");

                    let iconDiv = document.createElement("div");
                    iconDiv.setAttribute("class", "sensortype-icon type-" + sensorData.type);

                    $(iconDiv).css({
                        height: "20px",
                        width: "20px",
                        "background-size": "cover",
                        "margin-bottom": "2px",
                        "margin-right": "3px"
                    });

                    let dateStr = new moment(sensorData.timestamp).format("MM/DD/YYYY HH:mm");

                    //hopefully all the start times are reasonably aligned
                    startPlaceholder = sensorData.timestamp;

                    let sensorTypeInfo = AAI.getSensorTypeInfo(sensorData.type);

                    td1.append(dateStr);
                    td2.append(iconDiv, sensorTypeInfo.label);
                    td3.append(sensorData.type);
                    td4.append(sensorData.data + sensorTypeInfo.units);

                    tr.append(td1, td2, td3, td4);

                    $('#statsModalTable > tbody').append(tr);

                    if (displaySparkline == true) {

                        let trSpark = document.createElement("tr");
                        let tdSpark = document.createElement("td");
                        tdSpark.setAttribute("colspan", "4");
                        tdSpark.setAttribute("class", "td-spark");
                        trSpark.append(tdSpark);

                        let divSpark = document.createElement("div");
                        divSpark.setAttribute("style", "display:block;width:100%;");
                        tdSpark.append(divSpark);

                        $('#statsModalTable > tbody').append(trSpark);

                        let sparkClass = new AretasSparkSpan(AAI);

                        $(divSpark).show(function () {
                            sparkClass.createSparkSpan(divSpark, sensorItem.mac, sensorData.timestamp, sensorData.type);
                        });

                    }

                });

                let trFooter = document.createElement("tr");
                let tdFooter = document.createElement("td");
                tdFooter.setAttribute("colspan", "4");
                tdFooter.setAttribute("class", "td-spark");
                trFooter.append(tdFooter);

                //append the chart duration to the footer
                let endDateStr = new moment(startPlaceholder).format("MM/DD/YYYY HH:mm");
                let startDateStr = new moment(startPlaceholder - (4 * 60 * 60 * 1000)).format("MM/DD/YYYY HH:mm");
                tdFooter.append(`Chart duration from:${startDateStr} to${endDateStr}`);

                $('#statsModalTable > tbody').append(trFooter);

            }

        },
        complete: function (status) {

            let collection = document.getElementsByClassName("popup-mac-btn");
            for (let i = 0; i < collection.length; i++) {
                let node = collection.item(i);
                node.disabled = false;
            }
            $("#loader-sm").hide();
        },
        error: function () {
            console.log("Error getting latest data..");
            bootbox.alert("Failed to get recent data!");
            return;
        }
    });

}

class AretasSparkSpan {

    constructor(aretasAppInstance) {
        this._AAI = aretasAppInstance;
    }

    /**
     * Creates a 4 hour long spark span by default (if duration isn't specified in ms)
     * @param {*} targetDomElement 
     * @param {*} mac 
     * @param {*} timestamp 
     * @param {*} sensorType 
     * @param {*} duration 
     */
    async createSparkSpan(targetDomElement,
        mac,
        timestamp,
        sensorType,
        duration = 14400000) {

        var end = timestamp;
        var start = timestamp - duration;

        let ret = await this._AAI.getSensorDataByRange(mac, start, end, sensorType);

        //console.log(ret);
        this.sparkSpan(targetDomElement, ret.data, ret.macToken);

    }

    sparkSpan(domElementTarget, data, mac) {

        if (data.length < 1) {
            console.log("No data found");
            return;
        }

        let type = data[0].type;

        let sparklineData = [];

        for (let i = 0; i < data.length; i++) {
            sparklineData.push(data[i].data);
        }

        let sensorTypeInfo = this._AAI.getSensorTypeInfo(type);

        let sparkSpan = document.createElement("span");
        sparkSpan.setAttribute("id", "spark-span-" + type);
        sparkSpan.setAttribute("class", "sparkline-chart-span-latest");
        domElementTarget.append(sparkSpan);

        //console.log(dashboardStatsItem.sparklineData);
        try {

            $("#spark-span-" + type).sparkline(sparklineData, {
                height: 50,
                width: 400,
                lineColor: "#ffffff",
                fillColor: sensorTypeInfo.sensorColor.replace("0x", "#")
            });

        } catch (error) {
            console.log("Could not render sparkspan");
            console.log(sensorTypeInfo);
        }

    }

}


function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function reviver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

function replacer(key, value) {
    const originalObject = this[key];
    if (originalObject instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
        };
    } else {
        return value;
    }
}

class FullChartPopup {

    /**
     * 
     * @param {*} aretasAppInstance 
     * @param {*} targetDomElement The targetDomElement should be a modalFullChart with ID modalChartPopup
     */

    constructor(aretasAppInstance, targetDomElement) {
        this._AAI = aretasAppInstance;
        this._targetDomElement = targetDomElement;
        this._sensorType = null;
        this._sensorId = null;

        const classThis = this;
        this._targetDomElement.querySelector('#interval-select').addEventListener('change', (evt)=>{
            classThis.showFullChart(classThis._sensorType, classThis._sensorId);
        });
    }

    /**
     * 
     * @returns 
     */
    getStartEndTimes() {

        console.log(this._targetDomElement);

        let ret = {};

        console.log(this._targetDomElement.querySelector('#interval-select').value);

        let interval = parseInt(this._targetDomElement.querySelector('#interval-select').value);

        ret.start = Date.now() - (interval * 60 * 1000);
        ret.end = Date.now();

        console.debug(`Interval:${ret.start} ${ret.end}`);

        return ret;
    }

    /**
     * 
     * @param {*} data 
     */
    doChartStuff(data, mac, sensorType, sensorObj, locationObj) {

        const sensorInfoElement = this._targetDomElement.querySelector("#modalChartPopup-sensor-info");
        const locationInfoElement = this._targetDomElement.querySelector("#modalChartPopup-location-info");

        console.debug(sensorInfoElement);

        if (sensorInfoElement.innerHTML) sensorInfoElement.innerHTML = "";
        if (locationInfoElement.innerHTML) locationInfoElement.innerHTML = "";

        sensorInfoElement.innerHTML = `Device: ${sensorObj.description} in`;
        locationInfoElement.innerHTML = `${locationObj.description} at ${locationObj.streetAddress} , ${locationObj.city}`;

        const chartContainer = document.createElement("div");
        chartContainer.setAttribute("class", "chart-container");
        this._targetDomElement.querySelector('#modal-full-chart').append(chartContainer);

        const sensorTypeInfo = this._AAI.getSensorTypeInfo(sensorType);

        const chartY = data.map((datum)=> datum.data);
        const chartX = data.map((datum)=> datum.timestamp);

        console.log(sensorTypeInfo);

        const options = {
            series: [
                {
                    name: `${sensorTypeInfo.label} ${sensorTypeInfo.units}`,
                    data: chartY,
                },
            ],
            chart: {
                height: 350,
                type: 'line',
                dropShadow: {
                    enabled: true,
                    color: '#000',
                    top: 18,
                    left: 7,
                    blur: 10,
                    opacity: 0.2
                },
                toolbar: {
                    show: false
                }
            },
            colors: [sensorTypeInfo.sensorColor.replace("0x", "#")],
            dataLabels: {
                enabled: true,
            },
            stroke: {
                curve: 'smooth'
            },
            title: {
                text: 'Sensor Data',
                align: 'left'
            },
            grid: {
                borderColor: '#e7e7e7',
                row: {
                    colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
                    opacity: 0.5
                },
            },
            markers: {
                size: 1
            },
            xaxis: {
                type: 'datetime',
                categories: chartX,
                title: {
                    text: 'Time'
                }
            },
            yaxis: {
                title: {
                    text: `${sensorTypeInfo.label} ${sensorTypeInfo.units}`
                },
                min: sensorTypeInfo.sensorTypeIntelligence.binsInfo[0].min,
                max: sensorTypeInfo.sensorTypeIntelligence.binsInfo[sensorTypeInfo.sensorTypeIntelligence.binsInfo.length - 1].max
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right',
                floating: true,
                offsetY: -25,
                offsetX: -5
            }
        };

        const chart = new ApexCharts(document.querySelector(".chart-container"), options);
        chart.render();
    }

    /**
     * 
     * @param {*} sensorType 
     * @param {*} sensorId 
     */
    showFullChart(sensorType, sensorId) {

        const classThis = this;

        this._sensorType = sensorType;
        this._sensorId = sensorId;

        $(this._targetDomElement.querySelector('#modal-full-chart')).empty();

        this._targetDomElement.querySelector('.loader').style.display = 'block';

        $(this._targetDomElement).modal();

        const interval = this.getStartEndTimes();

        const sensorObj = this._AAI.getSensorByID(sensorId);
        const locationObj = this._AAI.getLocationByID(sensorObj.owner);
        const mac = sensorObj.mac;

        console.log(`Getting chart for sensor ${sensorObj.id} at location ${locationObj.id}`);

        //if the query is greater than 3 days, automatically enable decimation
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        let downsample = false;
        const threshold = 200; //max number of data points per line

        if ((interval.end - interval.start) > threeDaysMs) {
            downsample = true;
        }

        //query the data for these sensors
        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + AAI.bearerToken);
                xhr.setRequestHeader('X-Air-Token', mac);
            },
            dataType: "json",
            type: "GET",
            url: ASNAPIURL + "sensordata/byrange",
            data: {
                mac: mac,
                type: sensorType,
                begin: interval.start,
                end: interval.end,
                limit: 100000,
                downsample: downsample,
                threshold: threshold,
                offsetData: false,
            },
            success: function (data, status, xhr) {

                console.log();

                const strRespMac = xhr.getResponseHeader("X-Air-Token");
                let respMac = null;

                try {
                    respMac = parseInt(strRespMac);
                } catch (error) {
                    console.error("Could not parse X-Air-Token header");
                    console.error(error);
                }
                classThis.doChartStuff(data, respMac, sensorType, sensorObj, locationObj);

                $(classThis._targetDomElement).modal('show');

            },
            error: function () {
                console.log("failed to get sensor data for that sensor");
            },
            complete: function() {
                console.log("Complete");
                classThis._targetDomElement.querySelector('.loader').style.display = 'none';
            }
        });

    }
}

/**
 * Create a nicely formatted status tile out of a sensorDatum
 * @param {*} domTarget 
 * @param {*} sensorDatum 
 */
function createStatusTile(AAI, domTarget, sensorDatum, textColor, enableCol = false) {

    let divTile = document.createElement("div");

    if (enableCol) {
        divTile.setAttribute("class", "col-md-2 status-tile");
    } else {
        divTile.setAttribute("class", "status-tile");
    }

    let sensorObj = AAI.getSensorByMac(sensorDatum.mac);
    let locationObj = AAI.getLocationContainingMac(sensorObj.mac);

    let titleSpan = document.createElement("div");
    titleSpan.setAttribute("class", "title-text");
    titleSpan.append(locationObj.streetAddress + "," + locationObj.city);

    let titleSpan2 = document.createElement("div");
    titleSpan2.setAttribute("class", "title-text");
    titleSpan2.append(locationObj.description);

    let titleSpan3 = document.createElement("div");
    titleSpan3.setAttribute("class", "title-text");
    titleSpan3.append(sensorObj.description);

    divTile.append(titleSpan, titleSpan2, titleSpan3);

    let iconStyleStr = `color: ${textColor};`;

    //make some href links
    let dashIcon = document.createElement("i");
    dashIcon.setAttribute("class", "fas fa-tachometer-alt");
    dashIcon.setAttribute("style", iconStyleStr);

    let dashIconHref = document.createElement("a");
    dashIconHref.setAttribute("href", "sensor.html?mac=" + sensorDatum.mac);
    dashIconHref.setAttribute("title", "Click to go to Device Dashboard");
    dashIconHref.append(dashIcon);

    let chartIcon = document.createElement("i");
    chartIcon.setAttribute("class", "fas fa-chart-area");
    chartIcon.setAttribute("style", iconStyleStr);

    let chartIconHref = document.createElement("a");
    chartIconHref.setAttribute("href", "analytics.html?mac=" + sensorDatum.mac);
    chartIconHref.setAttribute("title", "Click to chart this Monitor");
    chartIconHref.append(chartIcon);

    let liveDataIcon = document.createElement("i");
    liveDataIcon.setAttribute("class", "fas fa-chart-line");
    liveDataIcon.setAttribute("style", iconStyleStr);

    let liveDataIconHref = document.createElement("a");
    liveDataIconHref.setAttribute("href", "livedata.html?mac=" + sensorDatum.mac);
    liveDataIconHref.setAttribute("title", "Click to view Current Data");
    liveDataIconHref.append(liveDataIcon);

    divTile.append(dashIconHref, chartIconHref, liveDataIconHref);

    let sensorTypeMetadata = AAI.getSensorTypeInfo(sensorDatum.type);

    let sensorIconDiv = document.createElement("div");
    sensorIconDiv.setAttribute("class", "sensortype-icon type-" + sensorDatum.type);

    $(sensorIconDiv).css({
        height: "20px",
        width: "20px",
        "background-size": "cover",
        "margin-bottom": "2px",
        "margin-right": "3px",
    });

    let divSensorTitle = document.createElement("div");
    divSensorTitle.setAttribute("class", "sensor-reading-title sensor-type-str");
    divSensorTitle.append(sensorIconDiv, sensorTypeMetadata.label);

    let divReading = document.createElement("div");
    divReading.setAttribute("class", "sensor-reading-data");
    divReading.append(sensorDatum.data + sensorTypeMetadata.units);

    divTile.append(divSensorTitle, divReading);

    let divStatusDiv = document.createElement("div");

    if (sensorObj.hasOwnProperty("status")) {

        console.log(sensorObj);
        let statusObj = AAI.getStatusColor(sensorObj.status, sensorDatum.type);
        divStatusDiv.setAttribute("class", statusObj.cssClass + " sensor-status");
        divStatusDiv.append(statusObj.statusTxt);

        if (sensorObj.status.hasOwnProperty("_status")) {

            let type = -1;

            try {
                type = parseInt(sensorObj.status._type);
            } catch (e) {

            }
            if ((sensorObj.status._status === "SENSOR_ALERT") && (sensorDatum.type === type)) {
                //only set the tile status to SENSOR_ALERT if the Types match
                divTile.setAttribute("data-sensor-status", sensorObj.status._status);
            } else if (sensorObj.status._status === "SENSOR_ALERT" && sensorDatum.type !== type) {
                divTile.setAttribute("data-sensor-status", "SENSOR_OK");
            } else {
                divTile.setAttribute("data-sensor-status", sensorObj.status._status);
            }

        }
    }

    divTile.append(divStatusDiv);

    let timeDiv = document.createElement("div");
    timeDiv.setAttribute("class", "time-text");
    timeDiv.append(new moment(sensorDatum.timestamp).format('MMMM Do YYYY, HH:mm'));

    divTile.append(timeDiv);

    //console.log(value);
    domTarget.append(divTile);
}
/**
 * This color codes certain elements to indicate their last reporting time 
 * If it hasn't reported in > 30 mins we flag it as down
 * If it hasn't reported in > 5 mins we flag it as "late"
 * 
 * @param {*} date 
 * @returns 
 */
function getTimestampBadgeClass(date) {

    var now = Date.now();

    //if a monitor hasn't reported in 30 mins, flag it as down
    if ((now - date) > (60 * 30 * 1000)) {
        return "badge-danger";
    }

    //if a monitor hasn't reported in 5 mins, flag it as warning 
    if ((now - date) > (60 * 5 * 1000)) {
        return "badge-warning";
    }

    return "badge-success";

}