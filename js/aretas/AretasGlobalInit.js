class AretasAppInstance {

    constructor() {

        if (typeof (Cookies.get('X-Aretas-Bearer')) == "undefined") {

            //we don't need to do anything else since any API request will trigger a 401
            //the 401 will trigger the login form to show
            //the login form then refreshes the page and presumably the bearer token is set
            console.warn("Bearer token cookie is not set");
            this._bearerToken = null;

        } else {

            this._bearerToken = Cookies.get('X-Aretas-Bearer');
            console.log(`Bearer token: ${this._bearerToken}`);
        }

        this.myLocation = null;
        this.sensorTypeInfo = null;
        this.clientLocationView = null;
        this._sensorStatuses = null;

    }

    get bearerToken() {
        return this._bearerToken;
    }

    set bearerToken(bTok) {
        this._bearerToken = bTok;
    }

    /**
     * - Get user's location
     * - Get all the sensor type metadata
     * - Get the client view
     * - Get the sensor statuses from cache
     */
    async aretasInitFunc() {

        /**
         * Get a browser user's approximate location, we will u se this later to try and select
         * locations close to them by default
         */
        try {

            let ret = await $.ajax({
                dataType: "json",
                type: "GET",
                url: "https://api.ipstack.com/check?access_key=039a88e1607c2a618fed7e96252ba923",
            });

            this.myLocation = {
                lng: ret.longitude,
                lat: ret.latitude
            };

            console.log("got location: " + this.myLocation.lat + "," + this.myLocation.lng);

        } catch (error) {

            console.error(error);
            console.error("Could not get location");

        }

        /**
         * This fetches the sensor type info, which is all the metadata about sensor types
         * (e.g. type, description, graph color, etc.)
         */
        try {

            let sensorTypeURL = ASNAPIURL + "sensortype/list";

            let data = await $.ajax({
                dataType: "json",
                type: "GET",
                url: sensorTypeURL,
            });

            console.log("Received Sensor Type Info");

            this.sensorTypeInfo = data;

        } catch (error) {

            console.error(error);
            console.error("failed to get sensor type info");

        }

        /**
         * This fetches the Client Location View Object, which is an object 
         * containing all of the user's locations / sensors / building maps, etc. 
         */

        try {

            let ret;

            console.log(`Bearer token:${this.bearerToken}`);

            let token = this.bearerToken;

            ret = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                },
                dataType: "json",
                type: "GET",
                url: ASNAPIURL + "client/locationview",
            });

            let isThereData = false;

            console.log("Success fetching client location view");

            this.clientLocationView = ret;
            this.clientLocationView.locationSensorViews.sort(dynamicSort("location", "description"));

            this.clientLocationView.locationSensorViews.forEach((locationView) => {

                locationView.sensorList.sort(dynamicSort("description"));

                if (locationView.lastSensorReportTime !== 0) isThereData = true;
            });

            console.log("my location:" + this.myLocation + " isThereData:" + isThereData);

            //get nearest location
            if ((this.myLocation != null) && (isThereData)) {

                let ret = getNearestLocationWithData(this.clientLocationView, this.myLocation);

                this.clientLocationView.nearestLocationIdWithData = ret.nearestLocationIdWithData;
                this.clientLocationView.nearestSensorLocationIdWithData = ret.nearestSensorLocationIdWithData;
            }


        } catch (error) {

            console.error("Error fetching clientLocationView..");
            console.error(error);

        }

        //get the sensor statuses
        try {

            const jsonStr = JSON.stringify(this.clientLocationView.allMacs);
            const token = this.bearerToken;
            const classThis = this;

            //it's safe to use clientLocationView.allMacs here
            const ret = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', `Bearer  ${token}`);
                },
                dataType: "json",
                data: jsonStr,
                contentType: "application/json",
                type: "POST",
                url: ASNAPIURL + "sensorstatus/list"
            });

            classThis.onSensorsStatusOK(ret);

        } catch (error) {

            console.error("Error calling sensor statuses");
            console.error(error);

        }

    }

    /**
     * Do a bit of filtering on the statuses and assign them to sensorLocations
     * This mutates the clientLocationView object that is passed in
     * @param {*} rawStatuses 
     */
    onSensorsStatusOK(rawStatuses) {

        console.log("Received sensor statuses");

        const pcacheProtocol = new PCacheProtocol();

        rawStatuses.forEach((rawStatus) => {

            const status = new SensorStatusData(rawStatus);

            //sanitize the status (having no data is the same as being down)
            if (status.status == pcacheProtocol.SENSOR_NO_DATA) {
                status.status = pcacheProtocol.SENSOR_DOWN;
            }

            if (status.status == pcacheProtocol.SENSOR_ALERT ||
                status.status == pcacheProtocol.SENSOR_DOWN ||
                status.status == pcacheProtocol.SENSOR_IN_STRATEGY ||
                status.status == pcacheProtocol.SENSOR_OK) {
                this.setSensorStatus(status);
            } else {
                console.warn(`Unrecognized Status:${status.status}`);
            }
        });

    }

    /**
     * Map the status object to it's mac (the mac may exist in different locations if shared)
     * @param {*} status 
     */
    setSensorStatus(status) {

        this.clientLocationView.locationSensorViews.forEach((locationView) => {
            locationView.sensorList.forEach((sensorLocation) => {
                if (sensorLocation.mac == status.mac) {
                    sensorLocation.status = new SensorStatusData(status);
                }
            });
        });

    }
    /**
     * this gets the statuses of each sensor from the CACHE.
     * We get additional information from the CACHE such as if the sensor is in 
     * alert, if it's ok, etc. we can call this once per location in a batch or all at once
     */
    async getRawSensorStatuses(macsList = null) {

        if (macsList == null) {
            macsList = this.clientLocationView.allMacs;
        }

        const classThis = this;

        try {

            const data = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                contentType: "application/json",
                dataType: "json",
                type: "POST",
                url: ASNAPIURL + "sensorstatus/list",
                data: JSON.stringify(macsList),
            });

            return data;

        } catch (error) {

            console.error("Could not fetch sensor statuses from cache!");
            console.error(error);
        }

    }
    /**
     * 
     * @param {*} mac 
     * @param {*} start 
     * @param {*} end 
     * @param {*} sensorType 
     * @returns 
     */
    async getSensorDataByRange(mac, start, end, sensorType) {

        let url = ASNAPIURL + "sensordata/byrange";
        //query the latest data
        let queryData = {
            mac: mac,
            begin: start,
            end: end,
            type: sensorType,
            limit: 10000000
        };

        let classThis = this;

        try {

            let response = await fetch(`${url}?` + new URLSearchParams(queryData), {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                    "X-Air-Token": mac
                }
            });

            let data = await response.json();
            let macToken = response.headers.get("X-AIR-Token");

            return {
                data,
                macToken
            };

        } catch (error) {

            console.error("Failed to query data");
            console.error(error);

        }

        return null;

    }
    /**
     * This function fetches the latest data from a list of sensors from the cache
     * This function is very fast (< 50ms for the whole TLS/REST transaction for dozens of monitors... 100+ sensors)
     * @param {*} sensorList 
     * @returns 
     */
    async getLatestSensorData(sensorList) {

        const jsonStr = JSON.stringify(sensorList);

        try {

            //query the statuses
            const data = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + AAI.bearerToken);
                },
                contentType: "application/json",
                dataType: "json",
                type: "POST",
                url: ASNAPIURL + "sensorreport/latest",
                data: jsonStr,
            });

            return data;

        } catch (error) {
            console.error("Could not fetch lastest sensor data for sensors:");
            console.error(sensorList);
            console.error(error);
        }

    }

    async listAreaTypes() {

        const classThis = this;

        try {

            //get the supported area types
            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "metadata/areatypes",
                type: 'GET',
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {
            console.error("Error fetching areatypes");
            console.error(error);
            return null;
        }
    }

    async listStrategies() {

        let url = ASNAPIURL + "strategy/list";

        let classThis = this;

        let queryData = {};

        try {

            let response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            let data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to query data");
            console.error(error);

        }

        return null;

    }

    async saveStrategy(strategyObj, onFinishedFunc = null) {

        let jsonStr = JSON.stringify(strategyObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "strategy/save",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async editStrategy(strategyObj, onFinishedFunc = null) {

        var jsonStr = JSON.stringify(strategyObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "strategy/update",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteStrategy(strategyObj, onFinishedFunc) {

        var jsonStr = JSON.stringify(strategyObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "strategy/remove",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async listAlerts() {

        let url = ASNAPIURL + "alert/list";

        let classThis = this;

        let queryData = {};

        try {

            let response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            let data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to query alert data");
            console.error(error);

        }

        return null;

    }

    async saveAlert(alertObj, onFinishedFunc = null) {

        let jsonStr = JSON.stringify(alertObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "alert/save",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async editAlert(alertObj, onFinishedFunc = null) {

        var jsonStr = JSON.stringify(alertObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "alert/update",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteAlert(alertObj, onFinishedFunc) {

        var jsonStr = JSON.stringify(alertObj);

        let classThis = this;

        try {

            let resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "alert/remove",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async listLocations() {

        let url = ASNAPIURL + "sitelocation/list";

        let classThis = this;

        let queryData = {};

        try {

            let response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            let data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to query location data");
            console.error(error);

        }

        return null;

    }

    async createLocation(locationObj, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(locationObj);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "sitelocation/create",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }
    /**
     * Edit a location passing in a locationObject
     * - set syncChildLocations to true if you want to update the lat/lng of devices that belong to this location
     * - pass in an onFinishedFunc to be called when complete
     * 
     * @param {*} locationObj 
     * @param {*} syncChildLocations 
     * @param {*} onFinishedFunc 
     * @returns 
     */
    async editLocation(locationObj, syncChildLocations = false, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(locationObj);
        const classThis = this;

        let url = ASNAPIURL + "sitelocation/update?syncDeviceLocations=";

        if (syncChildLocations == true) {
            url = url + "true";
        } else {
            url = url + "false";
        }

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: url,
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteLocation(locationObj, onFinishedFunc) {

        const jsonStr = JSON.stringify(locationObj);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "sitelocation/delete",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async listDevices() {

        const url = ASNAPIURL + "sensorlocation/list";
        const classThis = this;

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to query location data");
            console.error(error);

        }

        return null;

    }

    async createDevice(deviceObj, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(deviceObj);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "sensorlocation/create",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async editDevice(deviceObj, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(deviceObj);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "sensorlocation/update",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteDevice(deviceObj, onFinishedFunc) {

        const jsonStr = JSON.stringify(deviceObj);
        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "sensorlocation/remove",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async uploadMap(fileData) {

        const classThis = this;

        try {

            const response = $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "file/upload",
                type: 'POST',
                data: fileData,
                cache: false,
                dataType: "json",
                processData: false,
                contentType: false,
            });

            return response;

        } catch (error) {

            console.error("API Error uploading file:");
            console.error(error);

        }


    }

    async listBuildingMaps(locationId) {

        const url = ASNAPIURL + "buildingmaps/list";
        const classThis = this;

        const queryData = {
            locationId: locationId
        }

        try {

            const response = await fetch(`${url}?` + new URLSearchParams(queryData), {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to query location data");
            console.error(error);

        }

        return null;

    }

    async createBuildingMap(buildingMapObj, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(buildingMapObj);
        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "buildingmaps/create",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async editBuildingMap(buildingMapObj, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(buildingMapObj);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "buildingmaps/update",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteBuildingMap(buildingMapObj, onFinishedFunc = null) {

        const classThis = this;

        const queryData = {
            id: buildingMapObj.id
        }

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "buildingmaps/delete",
                type: 'GET',
                data: queryData,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    /***
     * DATA CLASSIFIER / DATA CLASSIFIER RECORD CRUD
     */


    async listDataClassifiers() {

        const url = ASNAPIURL + "dataclassifier/list";
        const classThis = this;

        const queryData = {};

        try {

            const response = await fetch(`${url}?` + new URLSearchParams(queryData), {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to get data classifiers list");
            console.error(error);

        }

        return null;

    }

    async createDataClassifier(dataClassifier, onFinishedFunc = null) {

        //final check the parent/owner ID is set correctly
        dataClassifier.parentId = this.clientLocationView.id;
        const jsonStr = JSON.stringify(dataClassifier);
        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "dataclassifier/create",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    async editDataClassifier(dataClassifier, onFinishedFunc = null) {

        //ensure the ID matches our ID
        dataClassifier.parentId = this.clientLocationView.id;

        const jsonStr = JSON.stringify(dataClassifier);

        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "dataclassifier/update",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }


    }

    async deleteDataClassifier(dataClassifier, onFinishedFunc = null) {

        dataClassifier.parentId = this.clientLocationView.id;

        const classThis = this;

        const queryData = {
            classifierId: dataClassifier.id
        }

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "dataclassifier/delete",
                type: 'GET',
                data: queryData,
                dataType: "json",
                contentType: "application/json"
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    /**
     * DATA CLASSIFIER RECORD STUFF
     */


    /**
     * 
     * @param {*} dataClassifierRecord
     * @param {*} onFinishedFunc 
     * @returns 
     */
    async saveDataClassifierRecord(dataClassifierRecord, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(dataClassifierRecord);
        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "dataclassifierrecord/save",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    /**
     * 
     * @param {*} dataClassifierRecord
     * @param {*} onFinishedFunc 
     * @returns 
     */
    async deleteDataClassifierRecord(dataClassifierRecord, onFinishedFunc = null) {

        const jsonStr = JSON.stringify(dataClassifierRecord);
        const classThis = this;

        try {

            const resp = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                url: ASNAPIURL + "dataclassifierrecord/delete",
                type: 'POST',
                data: jsonStr,
                dataType: "json",
                contentType: "application/json",
            });

            return resp;

        } catch (error) {

            console.error("Error communicating with API");
            console.error(error);

        } finally {

            if (onFinishedFunc) {
                onFinishedFunc();
            }
        }

    }

    /**
     * Fetch all the data classifier records for this particular label / classifier Id
     * @param {*} dataClassifierId 
     * @returns 
     */
    async listDataClassifierRecordsById(dataClassifierId) {

        const url = ASNAPIURL + "dataclassifierrecord/get/byid";
        const classThis = this;

        const queryData = {
            dataClassifierId: dataClassifierId,
        };

        try {

            const response = await fetch(`${url}?` + new URLSearchParams(queryData), {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to get data classifiers list");
            console.error(error);

        }

        return null;

    }

    async getClassifierRecordsByMacsTimestamp(macs, startTimeMs, endTimeMs) {

        const url = ASNAPIURL + "dataclassifierrecord/get/bymactimestamp";
        const classThis = this;

        const params = new URLSearchParams();

        params.append('startTimeMs', startTimeMs);
        params.append('endTimeMs', endTimeMs);

        for (const mac of macs) {
            params.append('macs', mac);
        }

        try {

            const response = await fetch(`${url}?` + params, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const data = await response.json();

            return data;

        } catch (error) {

            console.error("Failed to get data classifier records by macs timestamp");
            console.error(error);

        }

        return null;
    }


    /**
     * get the sensor type metadata for that type
     * @param {int} sensorType 
     */
    getSensorTypeInfo(sensorType) {

        //console.log(sensorType, sensorTypes);

        let ret = null;
        /* 
        this could get us in trouble because we should ensure the field are all the same types 
        since the json returned has things like "sensorColor":"0x00AA72" <- implying the number is a string not a long int
        might be ok though because the chart takes a border color as a RGB string (i.e. "#3e95cd")
        */
        for (let i = 0; i < this.sensorTypeInfo.length; i++) {

            let type = parseInt(this.sensorTypeInfo[i].type);

            if (type == sensorType) {
                ret = this.sensorTypeInfo[i];
                break;
            }
        }

        if (ret == null) {

            //console.log("null");

            ret = {
                enabled: true,
                display: true,
                sensorColor: "0xFF00FF",
                gasStatsSupported: false,
                sensorGasFormula: "",
                label: "Unknown Type",
                charCode: "UT",
                charting: true,
                type: sensorType,
                units: ''
            };
        }

        return ret;

    }
    /**
     * Fetch the location tags and area events for this building map
     * @param {*} buildingMapId 
     */
    async getBuildingMapChildren(buildingMapId) {

        let classThis = this;

        try {

            let locationTags = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                dataType: "json",
                type: "GET",
                url: ASNAPIURL + "locationtags/list",
                data: {
                    buildingMapId: buildingMapId
                },
            });

            let areaEvents = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                dataType: "json",
                type: "GET",
                url: ASNAPIURL + "areaevents/list",
                data: {
                    buildingMapId: buildingMapId
                }
            });

            return {
                locationTags,
                areaEvents
            };

        } catch (error) {

            console.warn("Could not fetch location tags and/or area events!");
            console.error(error);

        }


    }
    /**
     * - Get the statuses and last report times rolled up into a single map
     * - Pass in finishedFunc for housekeeping on the caller (e.g. hiding loader, etc.)
     * @param {*} finishedFunc 
     * @returns 
     */
    async getSensorStatusesAndLatestData(finishedFunc = null) {

        let classThis = this;

        /**
         * this gets the statuses of each sensor from the CACHE.
         * We get additional information from the CACHE such as if the sensor is in 
         * alert, if it's ok, etc. we can call this once per location in a batch or all at once
         */
        try {

            let cacheStatuses = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis._bearerToken);
                },
                contentType: "application/json",
                dataType: "json",
                type: "POST",
                url: ASNAPIURL + "sensorstatus/list",
                data: JSON.stringify(classThis.clientLocationView.allMacs),
            });

            let sensorStatusues = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis._bearerToken);
                },
                dataType: "json",
                type: "GET",
                url: ASNAPIURL + "sensorstatus/getallassocmacs",
            });

            let sensorList = new Map();

            //assemble a Map with only one entry per device
            this.clientLocationView.allMacs.forEach((mac) => {
                sensorList.set(parseInt(mac), {
                    mac: mac
                });
            });

            //get the statuses from the status cache
            cacheStatuses.forEach((status) => {
                //set the status of the device
                let sensorObj = sensorList.get(parseInt(status.mac));

                if (sensorObj != null) {
                    sensorObj.status = status;
                } else {
                    console.error("Did not have a Device in the clientLocationView object for Device in cache with MAC:" + status.mac);
                }
            });

            sensorList.forEach((sensor, macNumeric) => {

                let assocMacItem = this.getAssocMacsItem(sensor.mac, sensorStatusues);

                if (assocMacItem != null) {
                    sensor.lastReportTime = assocMacItem.timestamp;
                } else {
                    sensor.lastReportTime = 0;
                }
            });

            return sensorList;


        } catch (error) {

            console.log("Error querying sensor statuses / latest data");
            console.log(error);
            return null;

        } finally {

            if (finishedFunc) {
                finishedFunc();
            }

        }

    }

    async getCSVSensorData(queryParams) {

        const classThis = this;

        try {

            const data = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                dataType: "text",
                type: "GET",
                url: ASNAPIURL + "sensordata/byrange/csv",
                data: queryParams,
            });

            return data;

        } catch (error) {

            console.error("Could not fetch csv data from API!");
            console.error(error);
        }

    }

    async getCSVOrderedSensorData(queryParams) {

        const classThis = this;

        try {

            const data = await $.ajax({
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', "Bearer " + classThis.bearerToken);
                },
                dataType: "text",
                type: "GET",
                url: ASNAPIURL + "sensordata/byrange/csvordered",
                data: queryParams,
            });

            return data;

        } catch (error) {

            console.error("Could not fetch csv data from API!");
            console.error(error);
        }

    }

    /**
     * 
     * @param {*} buildingMapId - the building map ID
     * @param {*} sensorType - the sensor type uint
     * @param {*} paletteChoice - the aretas palette choice
     * @param {*} k - the rolloff constant for the bump function
     * @param {*} scalefactor - scaling the size of the building map (for example, if we want lower / higher resolution)
     * @returns 
     */
    async getHeatmapForBuildingMap(buildingMapId, sensorType, paletteChoice = 4, k = 0.13, scalefactor = 1) {

        const queryParams = {
            buildingMapId: buildingMapId,
            type: sensorType,
            paletteChoice: paletteChoice,
            k: k,
            scalefactor: scalefactor
        }

        console.debug(queryParams);

        const classThis = this;

        //create the search params 
        const params = new URLSearchParams(queryParams);

        const url = `${ASNAPIURL}heatmaps/buildingmap?${params}`;

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const blobData = await response.blob();
            const imgSrc = URL.createObjectURL(blobData);
            const image = new Image();
            image.src = imgSrc;

            await image.decode();

            return image;

        } catch (error) {

            console.error("Failed to get image data!");
            console.error(error);

        }

        return null;

    }

    /**
     * Get a field encoded image from sensor data query
     * @param {*} queryParams 
     * @returns 
     */
    async getFieldEncodedImage(queryParams) {

        console.debug(queryParams);

        const classThis = this;

        //have to do this weirdness to support array types
        const mutatedParams = JSON.parse(JSON.stringify(queryParams));

        //create the search params 
        const params = new URLSearchParams(mutatedParams);

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("requestedIndexes") && queryParams.requestedIndexes != '' && queryParams.requestedIndexes.length > 0) {

            delete mutatedParams.requestedIndexes;
            params.delete('requestedIndexes');

            //add the types 
            for (const requestedIndex of queryParams.requestedIndexes) {
                params.append("requestedIndexes", requestedIndex);
            }
        }

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("arrIEQAssumptions")) {

            delete mutatedParams['arrIEQAssumptions'];
            params.delete('arrIEQAssumptions');

            //add the types 
            for (const arrIEQAssumption of queryParams.arrIEQAssumptions) {
                params.append("arrIEQAssumptions", arrIEQAssumption);
            }
        }

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("type")) {

            delete mutatedParams.type;
            params.delete('type');

            //add the types 
            for (const type of queryParams.type) {
                params.append("type", type);
            }
        }

        const url = `${ASNAPIURL}sensordata/fieldencoder?${params}`;

        console.debug(url);

        //fetch(url,{headers: {hello:'World!'}}).then(r=>r.blob()).then(d=> this.src=window.URL.createObjectURL(d));

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const blobData = await response.blob();
            const imgSrc = URL.createObjectURL(blobData);
            console.debug(imgSrc);
            const image = new Image();
            image.src = imgSrc;

            await image.decode();

            return image;

        } catch (error) {

            console.error("Failed to get image data!");
            console.error(error);

        }

        return null;

    }

    /**
     * Fetch an XChart line chart image of the sensor data 
     * @param {*} queryParams 
     * @returns 
     */
    async getChartImage(queryParams) {

        console.debug(queryParams);

        const classThis = this;

        //have to do this weirdness to support array types
        const mutatedParams = JSON.parse(JSON.stringify(queryParams));

        //create the search params 
        const params = new URLSearchParams(mutatedParams);

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("requestedIndexes") && queryParams.requestedIndexes != '' && queryParams.requestedIndexes.length > 0) {

            delete mutatedParams.requestedIndexes;
            params.delete('requestedIndexes');

            //add the types 
            for (const requestedIndex of queryParams.requestedIndexes) {
                params.append("requestedIndexes", requestedIndex);
            }
        }

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("arrIEQAssumptions")) {

            delete mutatedParams['arrIEQAssumptions'];
            params.delete('arrIEQAssumptions');

            //add the types 
            for (const arrIEQAssumption of queryParams.arrIEQAssumptions) {
                params.append("arrIEQAssumptions", arrIEQAssumption);
            }
        }

        //remove the type property before we create the URLSearchParams
        if (queryParams.hasOwnProperty("type")) {

            delete mutatedParams.type;
            params.delete('type');

            //add the types 
            for (const type of queryParams.type) {
                params.append("type", type);
            }
        }

        const url = `${ASNAPIURL}sensordata/chartimage?${params}`;

        console.debug(url);

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            const blobData = await response.blob();
            const imgSrc = URL.createObjectURL(blobData);
            console.debug(imgSrc);
            const image = new Image();
            image.src = imgSrc;

            await image.decode();

            return image;

        } catch (error) {

            console.error("Failed to get image data!");
            console.error(error);

        }

        return null;

    }

    /**
     * Get a csv encoded data from a classifier
     * @param {*} queryParams 
     * @returns 
     */
    async exportLabelledData(queryParams) {

        console.debug(queryParams);

        const classThis = this;

        //have to do this weirdness to support array types (will leave here, even though there are no array params for this endpoint)
        const mutatedParams = JSON.parse(JSON.stringify(queryParams));

        //create the search params 
        const params = new URLSearchParams(mutatedParams);

        const url = `${ASNAPIURL}labelleddata/exportcsv?${params}`;

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            //get the content-disposition header
            const content_disposition = response.headers.get("Content-Disposition");
            let filename = content_disposition.split("=")[1];
            filename = filename.replace(/["']/g, "");

            const blobData = await response.blob();
            const src = URL.createObjectURL(blobData);
            
            const href = document.createElement('a');
            href.href = src;
            href.setAttribute('download',filename);
            href.click();

            return true;

        } catch (error) {

            console.error("Failed to get exported label data!");
            console.error(error);

        }

        return null;

    }

    /**
     * Get a field encoded image set for a classifier
     * @param {*} queryParams 
     * @returns 
     */
     async exportLabelledDataImages(queryParams) {

        console.debug(queryParams);

        const classThis = this;

        //have to do this weirdness to support array types (will leave here, even though there are no array params for this endpoint)
        const mutatedParams = JSON.parse(JSON.stringify(queryParams));

        //create the search params 
        const params = new URLSearchParams(mutatedParams);

        const url = `${ASNAPIURL}labelleddata/exportimages?${params}`;

        try {

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${classThis.bearerToken}`,
                }
            });

            //get the content-disposition header
            const content_disposition = response.headers.get("Content-Disposition");
            let filename = content_disposition.split("=")[1];
            filename = filename.replace(/["']/g, "");

            const blobData = await response.blob();
            const src = URL.createObjectURL(blobData);
            
            const href = document.createElement('a');
            href.href = src;
            href.setAttribute('download',filename);
            href.click();

            return true;

        } catch (error) {

            console.error("Failed to get exported label data!");
            console.error(error);

        }

        return null;

    }


    /**
     * 
     * Geocode a location object returns null if unsuccessful
     * 
     * @param {*} locationObj 
     * @returns 
     */
    async geocodeLocation(locationObj = null, txtData = null) {

        let txtToGeoCode;

        if (locationObj !== null) {
            txtToGeoCode = `${locationObj.streetAddress},${locationObj.city},${locationObj.state},${locationObj.country}`;
        } else {
            //use the txtData instead
            txtToGeoCode = txtData;
        }

        const mapKey = "Fmjtd%7Cluub2g68nq%2Cbn%3Do5-9uaxh0";
        const toPass = {};
        let latLng = null;

        toPass.location = txtToGeoCode;
        toPass.options = {
            "thumbMaps": false
        };

        try {

            const response = await $.ajax({
                //http://www.mapquestapi.com/geocoding/v1/address
                contentType: "application/json",
                dataType: "json",
                type: "POST",
                url: "https://www.mapquestapi.com/geocoding/v1/address?key=" + mapKey,
                data: JSON.stringify(toPass),
            });

            return response.results[0].locations[0].latLng;

        } catch (error) {

            console.error("Error geocoding location!");
            console.error(locationObj);
            console.error(error);

            return null;
        }
    }

    getAssocMacsItem(key, list) {

        for (let i = 0; i < list.length; i++) {
            if (list[i].mac == key) {
                return list[i];
            }
        }

        return null;
    }

    /**
     * get the first location that contains a MAC address
     * @param {int} mac 
     */
    getLocationContainingMac(mac) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            for (const sensor of locationView.sensorList) {
                if (sensor.mac == mac) {
                    return locationView.location;
                }
            }
        }

        return null;
    }

    /**
     * Get an Array of Sensor Object in a Location, by the Location's internal reference ID
     * @param {String} locationId 
     */
    getLocationSensorsByID(locationId) {

        var sensorList = {};

        for (const locationSensorView of this.clientLocationView.locationSensorViews) {

            if (locationId.trim() == locationSensorView.location.id.trim()) {
                return locationSensorView.sensorList;
            }

        }

        return null;
    }

    /**
     * get the MAC address for a Sensor by it's internal reference ID
     * @param {String} sensorLocationId 
     */
    getMacBySensorID(sensorLocationId) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            for (const sensor of locationView.sensorList) {
                if (sensor.id == sensorLocationId) {
                    return sensor.mac;
                }
            }
        }

        return null;
    }

    getSensorById(sensorLocation) {
        return this.getSensorByID(sensorLocation);
    }

    /**
     * get a sensor object by it's internal ID reference
     * @param {String} sensorLocationId 
     */
    getSensorByID(sensorLocationId) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            for (const sensorLocation of locationView.sensorList) {
                if (sensorLocation.id == sensorLocationId) {
                    return sensorLocation;
                }
            }

        }

        return null;

    }


    /**
     * Get the label of a MAC address from it's Sensor Object
     * (note the reversal of the params from the other calls, we need to refactor this)
     * @param {int} mac 
     */
    getMacLabel(mac) {

        for (const locationView of this.clientLocationView.locationSensorViews) {

            for (const sensor of locationView.sensorList) {
                if (sensor.mac == mac) {
                    return sensor.description;
                }
            }
        }

        return "No description";
    }

    /**
     * Get a Sensor / Device Object byt it's MAC address
     * @param {*} sensorMac 
     */
    getSensorByMac(sensorMac) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            for (const sensorLocation of locationView.sensorList) {
                if (sensorLocation.mac == sensorMac) {
                    return sensorLocation;
                }
            }
        }

        return null;
    }

    /**
     * Get a list of BuildingMap Objects by Location ID
     * @param {String} locationId 
     */
    getBuildingMapsByLocationID(locationId) {

        for (const locationView of this.clientLocationView.locationSensorViews) {

            if (locationId.trim() == locationView.location.id.trim()) {
                return locationView.buildingMapList;
            }
        }

    }

    /**
     * Get a list of Sensor Objects that belong to a BuildingMap 
     * @param {Object} buildingMap 
     */
    getSensorListByBuildingMap(buildingMap, onlyActive = false) {

        let sensorList = [];

        //get the location
        let sensors = this.getLocationSensorsByID(buildingMap.owner);

        //console.log(buildingMap);
        //console.log(location);

        for (const sensor of sensors) {
            if (sensor.hasOwnProperty("buildingMapId")) {
                if (sensor.buildingMapId == buildingMap.id) {
                    if (onlyActive == true) {

                        if (sensor.hasOwnProperty("lastReportTime")) {
                            if (sensor.lastReportTime > 0) {
                                sensorList.push(sensor);
                            }
                        }

                    } else {
                        sensorList.push(sensor);
                    }
                }
            }
        }

        return sensorList;

    }

    /**
     * Get a BuildingMap object by it's internal ID reference
     * @param {String} buildingMapId 
     */
    getBuildingMapByID(buildingMapId) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            for (const buildingMap of locationView.buildingMapList) {
                if (buildingMap.id == buildingMapId) {
                    return buildingMap;
                }
            }
        }

        return null;

    }

    /**
     * get a Location Object by it's internal ID reference
     * @param {String} locationId 
     */
    getLocationByID(locationId) {

        for (const locationView of this.clientLocationView.locationSensorViews) {
            if (locationView.location.id == locationId) {
                return locationView.location;
            }
        }

    }

    /**
     * Pass in a <select> dom element reference
     * it will be populated with all of the sensor types / labels
     * @param {*} domElement 
     */
    populateSensorTypeOptions(domElement) {

        domElement.innerHTML = "";

        const sensorTypeInfo = JSON.parse(JSON.stringify(this.sensorTypeInfo));

        //re-sort alphabetically
        sensorTypeInfo.sort(function (a, b) {
            return a.label.localeCompare(b.label);
        });

        for (const typeObj of sensorTypeInfo) {

            const opt = document.createElement("option");
            opt.setAttribute("value", typeObj.type);
            if ((typeObj.label == null) || (typeObj.label == "")) {
                typeObj.label = "Unlabeled";
            }
            if (typeObj.hasOwnProperty("units") !== false && typeof typeObj.units !== "undefined" && typeObj.unts !== null) {
                opt.append(`${typeObj.label} (${typeObj.units})`);
            } else {
                opt.append(`${typeObj.label}`);
            }

            domElement.append(opt);
        }

        return;
    }

    /**
     * Create a palette legend in the domTarget based on the selected palette and number range to map
     * @param {*} domTarget 
     * @param {*} paletteSelection 
     * @param {*} paletteRange 
     */
    createPaletteLegend(domTarget, paletteSelection, paletteRange) {

        let queryParams = {};

        queryParams.sourceValues = paletteRange;
        queryParams.paletteSelection = paletteSelection;

        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + AAI.bearerToken);
            },
            contentType: "application/json",
            //dataType: "json",
            type: "GET",
            url: ASNAPIURL + "palette/mapint",
            traditional: true,
            data: queryParams,
            success: function (data) {
                console.log("Success");
                console.debug(data);
            }
        });

    }

    getExpectedRange(type) {

        for (const sensorType of this.sensorTypeInfo) {
            if (sensorType.type == type) {

                if (sensorType.hasOwnProperty("sensorTypeIntelligence") &&
                    sensorType.sensorTypeIntelligence.hasOwnProperty("binsInfo") &&
                    sensorType.sensorTypeIntelligence.binsInfo.length > 0) {

                    const firstBin = sensorType.sensorTypeIntelligence.binsInfo[0];

                    const ret = {
                        min: firstBin.min,
                        max: firstBin.max,
                    }

                    for (const bin of sensorType.sensorTypeIntelligence.binsInfo) {
                        if (bin.min < ret.min) {
                            ret.min = bin.min;
                        }

                        if (bin.max > ret.max) {
                            ret.max = bin.max;
                        }

                    }

                    return ret;

                }
            }
        }

        return {
            min: -100000,
            max: +100000
        };

    }

    /**
     * Sets up blue/green/yellow/red/blue zones for Gauges by sensor type
     * 
     * Don't like this, we should really do this differently
     * @param {int} type 
     */
    getGaugeStaticZones(type) {

        const noInfo = "rgba(255,255,255,0)"; //transparent
        const red =     '#FF192F';
        const green =   '#5BAB46';
        const yellow =  '#F5D91C';

        for (const sensorType of this.sensorTypeInfo) {
            if (sensorType.type == type) {

                if (sensorType.hasOwnProperty("sensorTypeIntelligence") &&
                    sensorType.sensorTypeIntelligence.hasOwnProperty("binsInfo") &&
                    sensorType.sensorTypeIntelligence.binsInfo.length > 0) {

                    const ret = [];

                    for (const bin of sensorType.sensorTypeIntelligence.binsInfo) {

                        const toPush = {
                            min: parseFloat(bin.min),
                            max: parseFloat(bin.max),
                        }

                        switch (bin.strokeStyle) {
                            case "red":
                                toPush.strokeStyle = red;
                                break;

                            case "yellow":
                                toPush.strokeStyle = yellow;
                                break;

                            case "green":
                                toPush.strokeStyle = green;
                                break;

                            case "noinfo":
                                toPush.strokeStyle = noInfo;
                                break;

                            //allow overrides
                            default:
                                //assume it's a hex color
                                toPush.strokeStyle = bin.strokeStyle;
                                break;
                        }

                        ret.push(toPush);
                    }

                    return ret;

                }
            }
        }

        return [{
            strokeStyle: noInfo,
            min: -100000,
            max: +100000
        }];
    }

    /**
     * Gets the SensorType Intel bin for that type and value
     * @param {int} type 
     */
    getSensorTypeIntelBin(type, value) {

        for (const sensorType of this.sensorTypeInfo) {
            if (sensorType.type == type) {

                if (sensorType.hasOwnProperty("sensorTypeIntelligence") &&
                    sensorType.sensorTypeIntelligence.hasOwnProperty("binsInfo") &&
                    sensorType.sensorTypeIntelligence.binsInfo.length > 0) {

                    for (const bin of sensorType.sensorTypeIntelligence.binsInfo) {
                        if (value < bin.max && value > bin.min) {
                            return bin;
                        }

                    }

                }
            }
        }

        return {
            strokeStyle: "noinfo",
            min: -100000,
            max: +100000
        };
    }

    /**
     * Return "scored" color for that sensor reading
     * However, in the case of noInfo zones that would normally return
     * a transparent rgba(255,255,255,0) color, we just return grey
     * @param {int} type 
     * @param {float} value 
     * @returns 
     */
    getIconDivColor(type, value) {

        //console.debug("Getting static zone color " + type + " ," + value);

        let staticZone = this.getGaugeStaticZones(type);
        let bgColor = "#CCCCCC";

        for (let i = 0; i < staticZone.length; i++) {

            let thisZone = staticZone[i];

            if ((value <= thisZone.max) && (value >= thisZone.min)) {
                //we don't want transparent icons
                if (thisZone.strokeStyle == "rgba(255,255,255,0)") {
                    return bgColor;
                } else {
                    return thisZone.strokeStyle;
                }
            }
        }
        // console.log(staticZone);

        return bgColor;
    }

}


/**
 * Returns the ID of the nearest location with data (assuming we have data) 
 * as well as the nearest sensor location with data
 * 
 * requires turf.js 
 * 
 * @param {} clientLocationView 
 * @param {*} myLocation 
 * @returns 
 */
function getNearestLocationWithData(clientLocationView, myLocation) {

    let ret = {
        nearestLocationIdWithData: null,
        nearestSensorLocationIdWithData: null
    };

    console.log("getting nearest location");

    let targetPoint = turf.point([myLocation.lat, myLocation.lng]);
    let featureCollectionArray = [];

    let points = turf.featureCollection(featureCollectionArray);

    //get the list of locations with reporting sensors
    clientLocationView.locationSensorViews.forEach((locationView) => {

        if (locationView.hasOwnProperty("lastSensorReportTime")) {

            if (locationView.lastSensorReportTime != 0) {

                let lat = locationView.location.lat;
                let lng = locationView.location.lon;

                featureCollectionArray.push(turf.point([lat, lng], {
                    id: locationView.location.id
                }));

            }
        }

    });

    /** kind of a critical issue, if no locations have data, then this kills the whole page load */
    let nearest = turf.nearestPoint(targetPoint, points);

    if (nearest.hasOwnProperty("properties")) {
        ret.nearestLocationIdWithData = nearest.properties.id;
    }

    console.log("getting nearest sensor");

    targetPoint = turf.point([myLocation.lat, myLocation.lng]);
    featureCollectionArray = [];

    points = turf.featureCollection(featureCollectionArray);

    //get the list of sensors with reporting sensors
    clientLocationView.locationSensorViews.forEach((locationView) => {

        let sensorList = locationView.sensorList;

        sensorList.forEach((sensorItem) => {

            if (sensorItem.hasOwnProperty("lastReportTime")) {

                let now = Date.now();

                if ((sensorItem.lastReportTime != 0) && ((now - sensorItem.lastReportTime) < 30 * 60 * 1000)) {

                    try {

                        if (sensorItem.lat != 0 && sensorItem.lat != -1 && sensorItem.lon != 0 && sensorItem.lon != -1) {
                            let lat = sensorItem.lat;
                            let lng = sensorItem.lon;

                            featureCollectionArray.push(turf.point([lat, lng], {
                                id: sensorItem.id
                            }));
                        }
                    } catch (err) {

                        console.warn("could not convert lat/lng from sensor");
                        console.warn(sensorItem);
                    }


                }
            }

        });

    });

    nearest = turf.nearestPoint(targetPoint, points);

    if (nearest != null) {
        if (nearest.hasOwnProperty("properties")) {
            ret.nearestSensorLocationIdWithData = nearest.properties.id;
        }
    }

    return ret;
}

/**
 * a very basic class to help map WS sensor statuses
 */
class PCacheProtocol {

    constructor() {

        this.KEY_SENSOR_STATUS_PREFIX = "sensor.status,";
        this.KEY_SENSOR_LAST_REPORT_PREFIX = "sensor.lastreport,";
        this.KEY_SENSOR_ALERT_HISTORY_PREFIX = "sensor.alert_history,";
        this.KEY_SENSOR_LAST_READING_PREFIX = "sensor.last_reading,";
        this.SENSOR_DOWN = "SENSOR_DOWN";
        this.SENSOR_ALERT = "SENSOR_ALERT";
        this.SENSOR_OK = "SENSOR_OK";
        this.SENSOR_IN_STRATEGY = "SENSOR_IN_STRATEGY";
        this.SENSOR_NO_DATA = "NO_DATA";

    }
}
/**
 * Requires replacer and reviver from aretas-commons.js to support Map()
 */
class AretasSession {

    constructor() {

        this._pageSessionSettings = null;
        this.loadSession();
    }

    loadSession() {

        let save = false;
        let pageSessionSettings = null;

        const storageStr = window.localStorage.getItem("X-Aretas-pageSessionSettings");

        try {
            pageSessionSettings = JSON.parse(storageStr);
        } catch (error) {
            save = true;
            pageSessionSettings = {};
            console.warn(`Error parsing X-Aretas-pageSessionSettings ${storageStr}`);
            console.warn(error);
        }

        console.log(typeof pageSessionSettings);

        if (pageSessionSettings == null) {
            pageSessionSettings = {};
            save = true;
        }

        if (typeof pageSessionSettings !== "object") {
            pageSessionSettings = {};
            save = true;
        }

        if (pageSessionSettings.hasOwnProperty("pageProps") !== true) {
            pageSessionSettings.pageProps = {};
            save = true;
        }

        this._pageSessionSettings = pageSessionSettings;

        if (save == true) {
            this.saveSession();
        }

    }

    saveSession() {
        window.localStorage.setItem("X-Aretas-pageSessionSettings", JSON.stringify(this._pageSessionSettings));
    }

    /**
     * Gets a pageProps Map and if one doesn't exist, creates it
     * @param {*} pageString 
     * @returns 
     */
    getPageProps(pageString) {

        let pageProps = this._pageSessionSettings.pageProps[pageString]

        if (pageProps == null) {
            pageProps = {};
            this._pageSessionSettings.pageProps[pageString] = {};
        }

        return pageProps;
    }

    saveProp(pageString, propName, propValue) {

        //get the Map() for that page
        const pageProps = this.getPageProps(pageString);
        pageProps[propName] = propValue;
        this.saveSession();

    }

    getProp(pageString, propName) {
        const pageProps = this.getPageProps(pageString);
        return pageProps[propName];
    }
}



class SensorStatusData {

    constructor(object) {

        this._mac = object.mac;
        this._status = object.status;
        this._timestamp = object.timestamp;
        this._type = object.type;
    }

    get mac() {
        return this._mac;
    }

    set mac(mac) {
        this._mac = mac;
    }

    get status() {
        return this._status;
    }

    set status(status) {
        this._status = status;
    }

    get timestamp() {
        return this._timestamp;
    }

    set timestamp(timestamp) {
        this._timestamp = timestamp;
    }

    set type(type) {
        this._type = type;
    }

    get type() {
        return this._type;
    }
}

class AretasAlertHistory {

    constructor(aretasAppInstance) {
        this._AAI = aretasAppInstance;
    }

    queryAlertHistory(domTarget) {

        var jsonStr = JSON.stringify(AAI.clientLocationView.allMacs);

        let classThis = this;

        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
            },
            dataType: "json",
            data: jsonStr,
            contentType: "application/json",
            type: "POST",
            url: ASNAPIURL + "alerthistory/list",
            success: function (data) {
                classThis.onQueryAlertHistoryOK(data, domTarget);
            },
            error: function (data) {
                console.log("Error calling sensor alert statuses");
                //console.log(data);
            }
        });

    }


    /**
     * 
     * @param {*} data 
     * @param {*} container 
     */
    onQueryAlertHistoryOK(alertHistoryResults, domTarget) {

        $(domTarget).empty();

        const spanTitle = document.createElement("span");
        spanTitle.setAttribute("class", "title-text");
        spanTitle.append("Notifications:");

        //domTarget.append(spanTitle);

        const classThis = this;

        for (const value of alertHistoryResults) {

            const dismissBtn = document.createElement("button");
            dismissBtn.setAttribute("class", "dismiss-btn");
            dismissBtn.append("X");

            const d = document.createElement("div");
            d.setAttribute("class", "alert-notice");

            d.append(dismissBtn);

            $(dismissBtn).click((evt) => {
                $(d).hide();
                classThis.dismissAlertHistoryObject(value.mac, value.sensorType, value.alertId);
            });

            const alertIcon = document.createElement("i");
            alertIcon.setAttribute("class", "fas fa-exclamation-circle");

            d.append(alertIcon);

            const spanMsg = document.createElement("span");
            spanMsg.setAttribute("class", "msg");

            //Sensor TRHCO2-blah is in Alert state. CO2 is xxx PPM at 16:00
            const sInfo = this._AAI.getSensorTypeInfo(value.sensorType);
            const sensorObj = this._AAI.getSensorByMac(value.mac);

            const date = moment(value.timestamp).format('MMMM Do YYYY, HH:mm');
            const msg1 = "Device " + sensorObj.description + " triggered an Alert.";
            const msg2 = sInfo.label + " was " + value.sensorData.toFixed(2) + sInfo.units + " at " + date;

            const br = document.createElement("br");

            const start = value.timestamp - (30 * 60 * 1000);
            const end = value.timestamp + (30 * 60 * 1000);

            const a = document.createElement("a");
            a.setAttribute("href", `analytics.html?mac=${value.mac}&start=${start}&end=${end}`);
            a.setAttribute("title", "Click to view data around that time");

            const chartIcon = document.createElement("i");
            chartIcon.setAttribute("class", "fas fa-chart-area");
            a.append(chartIcon);

            spanMsg.append(msg1, br, msg2, a);
            d.append(spanMsg);
            domTarget.append(d);

        }
    }

    /**
     * Dismiss an alert history object in the back end ("mark it read")
     * 
     * @param {*} mac 
     * @param {*} type 
     * @param {*} alertId 
     */
    dismissAlertHistoryObject(mac, type, alertId) {

        console.info(`Dismissing AlertHistory for mac:${mac} type:${type} alertId:${alertId}`);

        let classThis = this;

        //get approximate location
        $.ajax({
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', "Bearer " + classThis._AAI.bearerToken);
            },
            dataType: "json",
            type: "GET",
            url: ASNAPIURL + "alerthistory/dismiss",
            data: {
                mac: mac,
                type: type,
                alertId: alertId
            },
            success: function (data) {
                console.log(`Dismissed AlertHistoryObject mac:${mac} type:${type} alertId:${alertId}`);
            },
            error: function (err) {
                console.error(`Could not dismiss alertHistoryObject! ${err}`);
            }

        });
    }

}