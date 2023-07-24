/**
 * AlertHistory Business Logic
 * 
 * Requires:
 * - aretas-commons.js
 * - jquery
 */

/**
 * 
 * @param {*} rootElement 
 * @param {*} macList 
 */
function populateAlertHistoryView(rootElement, macList) {

    let postData = JSON.stringify(macList);

    //it's safe to use clientLocationView.allMacs here
    ret = $.ajax({
        beforeSend: function (xhr) {
            xhr.setRequestHeader('Authorization', "Bearer " + bearerToken);
        },
        dataType: "json",
        data: postData,
        contentType: "application/json",
        type: "POST",
        url: ASNAPIURL + "alerthistory/list",
        success: function (data) {
            console.log("Received Latest Alert History:");
            console.log(data);
        },
        error: function (data) {
            console.log("Error getting Alert History!");
            console.log(data);
        }
    }).promise();

    return ret;


}