//AugmentedOperator nodes
module.exports = function (RED) {
    "use strict";

    //AugmentedOperator-variable node
    function arservervariablenode(config) {
        var ARSERVER_QUALITY = { GOOD: "good", BAD: "bad" };
        //Types presented here has to be synchronized with types available through the info html file.
        var SUPPORTED_TYPE_TABLE = [
            "String",
            "WString",
            "Boolean",
            "Int8",
            "Int16",
            "Int32",
            "UInt8",
            "UInt16",
            "UInt32",
            "Float",
            "Double",
            "SByte",
            "Byte",
            "Time",
            "Date",
            "DateTime",
            "TimeOfDay",
        ];
        RED.nodes.createNode(this, config);
        var node = this;
        this.arservervalue = config.arservervalue;
        this.arservervalueType = config.arservervalueType;

        var getTimestamp = function () {
            return Math.round(new Date().getTime() / 1000.0);
        };

        //This node does not provide data type convertion.
        // . The convertion is realized by the api_stateram while getting a variable through its GET API.
        // . At this point, all the data are put in AR Server StateRam into the string format for compatibility issues.
        var convertVariable = function (value, type, quality) {
            if (SUPPORTED_TYPE_TABLE.indexOf(type) == -1) {
                console.log("Error: The type '" + type + "' is not supported. Types supported are:[" + SUPPORTED_TYPE_TABLE.toString() + "]");
                RED.log.error("The Type is not supported!");
                return;
            }
            //Convertion using SUPPORTED_TYPE_TABLE:
            /*return SUPPORTED_TYPE_TABLE[type].conversionFunction(value);*/
            var resValue = (typeof val === 'object') ? value.toString() : "" + value;
            return { "value": resValue, "datatype": type, "quality": quality };
        };

        this.on('input', function (msg) {
            var res = {};
            var ARServer_variable = { "type": null, "value": null, "quality": null, "timestamp": null };
            //Set ARServer_variable VALUE :
            // . 1> interpret value according to the specified node-red source (fixed or depending from msg).
            // . 2> convert interpreted value according to the specified type (in info tab config.arserverdatatype).
            // . 3> set the ttl value iff specified in info tab.
            // . 4> retrieve and associate the fully qualied name (key) to the value .

            // 1>
            var currentValue;
            if ("ar_datamodel_value" in msg) { // The 'value' field has been specified in msg, it has priority over the specified fields in the node configuration:
                currentValue = msg.ar_datamodel_value;
            } else { // The value field has to be retrieved from 
                if ((config.arservervalueType === null && config.arservervalueType === "") || config.arservervalueType === "msg") {
                    currentValue = RED.util.evaluateNodeProperty(this.arservervalue, this.arservervalueType, this, msg)
                } else if (config.arservervalueType === "flow" || config.arservervalueType === "global") {
                    currentValue = RED.util.evaluateNodeProperty(this.arservervalue, this.arservervalueType, this, msg);
                } else if (config.arservervalueType === "other") {
                    currentValue = config.arservervalue;
                } else {
                    console.log("Error: type not yet implemented!");
                    return;
                }
            }

            var currentType = ("ar_datamodel_type" in msg && msg.ar_datamodel_type) ? msg.ar_datamodel_type : config.arserverdatatype;
            var currentQuality = ("ar_datamodel_quality" in msg && msg.ar_datamodel_quality) ? msg.ar_datamodel_quality : ARSERVER_QUALITY.GOOD;

            // 2>
            var currentARVariable = convertVariable(currentValue, currentType, currentQuality);
            //Set ARServer_variable VALUE : 
            ARServer_variable.value = currentARVariable.value;
            //Set ARServer_variable QUALITY : 
            ARServer_variable.quality = currentARVariable.quality;
            //Set ARServer_variable TYPE :
            ARServer_variable.type = currentARVariable.datatype;
            //Set ARServer_variable TIMESTAMP :
            ARServer_variable.timestamp = getTimestamp();

            // 3>
            /*
			if (config.arserveristtl){
				ARServer_variable.ttl = config.arserverttlvalue + config.arserverttlunit;
			} else{
				delete ARServer_variable.ttl;
            }
            */

            // 4>
            var retrievedNs = (msg.ar_datamodel_namespace) ? msg.ar_datamodel_namespace : config.arservervarnamespace;
            var retrievedName = (function(){
              //It returns msg.ar_datamodel_name OR msg.topic OR config.arservervarname
              if (msg.ar_datamodel_name){
                return msg.ar_datamodel_name;
              }
              if (msg.topic){
                return msg.topic;
              }
              if (config.arservervarname){
                return config.arservervarname;
              }
              return "";
            })();

            // construct the fully qualified name through namespace if any and variable name:
            var fullyQualifiedName = (retrievedNs) ? retrievedNs + '.' + retrievedName : retrievedName;
            res[fullyQualifiedName] = ARServer_variable;

            msg.payload = res;

            if (fullyQualifiedName) {
                node.send(msg);
                node.status({});
            } else {
                this.status({ fill: "red", shape: "ring", text: "Variable name missing!" });
                setTimeout(function () { node.status({}); }, 2000);
                RED.log.error("Carreful, msg has not been sent: Variable name or msg.ar_datamodel_name have not been specified!");
            }
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //AugmentedOperator-server node
    function arservernode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var request = require('request');
        // Retrieve node context
        var context = this.context();

        this.on('input', function (msg) {
            //AugmentedOperator 360 request call
            var augmentedOp_http_request = function (msg, config) {
                //Reset msg fields if any:
                delete msg.ar_datamodel_name;
                delete msg.ar_datamodel_type;
                delete msg.ar_datamodel_value;

                //Display a blue shape tooltip under the node.
                node.status({ fill: "blue", shape: "dot", text: "httpin.status.requesting" });
                clearTimeout(node.resetStatus_timeout);
                node.resetStatus_timeout = setTimeout(function () { node.status({}); }, 2000);
                //Define and initialize variables
                var reqParams = null;
                var url = "http://127.0.0.1" + ":" + config.arserverport + "/api/v2.0/variable";


                //Retrieve and add to url the global setted and potentially accumulated variable
                if (config.arservermethod == "GET") {
                    //Remove the last "," inserted from the accumulated variable
                    var v360_msg_get_buffer = context.get("v360_msg_get_buffer");
                    var endsWithComa = v360_msg_get_buffer.charAt(v360_msg_get_buffer.length - 1);
                    if (endsWithComa === ",") {
                        v360_msg_get_buffer = v360_msg_get_buffer.substring(0, v360_msg_get_buffer.length - 1);
                    }
                    context.set('v360_msg_get_buffer', v360_msg_get_buffer);
                    reqParams = { url: url + "?name=" + context.get("v360_msg_get_buffer"), method: "GET" };
                } else if (config.arservermethod == "PUT") {
                    reqParams = { url: url, method: "PUT", json: context.get("v360_msg_put_buffer") };
                } else {
                    RED.log.error("Method not implemented!");
                }
                if (reqParams) {
                    /*console.log("url requested: " + reqParams.url);*/
                    request(reqParams, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            msg.payload = body ? body : "";
                            msg.statusCode = response.statusCode;
                            node.status({ fill: "green", shape: "ring", text: "Success!" });
                            clearTimeout(node.resetStatus_timeout);
                            node.resetStatus_timeout = setTimeout(function () { node.status({}); }, 2000);
                        } else if (response && response.statusCode) {
                            msg.payload = body ? body : "Error";
                            msg.statusCode = response.statusCode;
                            node.status({ fill: "red", shape: "ring", text: "statusCode:" + response.statusCode });
                            clearTimeout(node.resetStatus_timeout);
                            node.resetStatus_timeout = setTimeout(function () { node.status({}); }, 2000);
                        } else {
                            node.status({ fill: "red", shape: "ring", text: error.code });
                            clearTimeout(node.resetStatus_timeout);
                            node.resetStatus_timeout = setTimeout(function () { node.status({}); }, 2000);
                            var errormsg = "Error: server: " + url + " could not be contacted!";
                            if (error) {
                                errormsg += " Error:" + error;
                            }
                            msg.payload = errormsg;
                        }
                        node.send(msg);

                    });
                }
                //Reset the buffers and the set to true the send toggle for the next request creation:
                context.set('v360_msg_get_buffer', "");
                context.set('v360_msg_put_buffer', {});
                context.set('v360_msg_buffer_send_toggle', true);
                /*console.log("Context[v360_msg_put_buffer] reset!");*/
            };



            //Retrieve buffers from the context of this current node or initialize it:
            var v360_msg_put_buffer = context.get('v360_msg_put_buffer') || {};
            var v360_msg_get_buffer = context.get('v360_msg_get_buffer') || "";

            //Every message given, we set and accumulate the two previously defined buffer in the current node context:
            // - 'v360_msg_put_buffer' in case of PUT
            // - 'v360_msg_get_buffer' in case of GET
            switch (config.arservermethod) {
                case "PUT":
                    if (msg.payload) {
                        //Set or accumulate PUT params in context into 'v360_msg_put_buffer' variable
                        switch (typeof msg.payload) {
                            case 'object':
                                var currentKey = Object.keys(msg.payload);
                                var currentValue = null;
                                if (currentKey.length == 1) {
                                    currentValue = msg.payload[currentKey];
                                    //Add to v360_msg_put_buffer the current Key/Value
                                    v360_msg_put_buffer[currentKey] = currentValue;
                                    context.set('v360_msg_put_buffer', v360_msg_put_buffer);
                                } else if (currentKey.length > 1) {
                                    //In case of multiple objects passed in msg.payload we update them all in the v360_msg_put_buffer:
                                    for (var index = 0; index < currentKey.length; index++) {
                                        currentValue = msg.payload[currentKey[index]];
                                        v360_msg_put_buffer[currentKey[index]] = currentValue;
                                    }
                                    context.set('v360_msg_put_buffer', v360_msg_put_buffer);
                                } else {
                                    RED.log.error("msg.payload could not be put in ARServer.");
                                }
                                break;
                            default:
                                RED.log.error("msg.payload has to be an object.");
                        }
                    } else {
                        RED.log.error("The msg.payload should be an object");
                        reqParams = null;
                    }
                    break;
                case "GET":
                    //Set or accumulate GET params in context into 'v360_msg_get_buffer' variable
                    if (msg.payload) {
                        var currentVars = null;
                        switch (typeof msg.payload) {
                            case 'object':
                                currentVars = Object.keys(msg.payload)[0].toString();
                                break;
                            default:
                                currentVars = msg.payload.toString();
                        }
                        //Append variables with 
                        v360_msg_get_buffer += currentVars + ',';
                        context.set('v360_msg_get_buffer', v360_msg_get_buffer);
                    } else {
                        RED.log.error("The msg.payload should be a string of variable names comma separated. ie. \"VAR1,VAR2,VAR3\"");
                        reqParams = null;
                    }
                    break;
                default:
                    RED.log.error("Method not yet implemented!");
                    break;
            }

            //Retrieve v360_msg_buffer_send_toggle or true at initialization.
            var v360_msg_buffer_send_toggle = (context.get('v360_msg_buffer_send_toggle') === undefined) ? true : context.get('v360_msg_buffer_send_toggle');
            //Send the request to Augmented Operator Server following two cases:
            // . Case 1: The request is delayed 'config.arserverbufferinterval' ms. During this interval, the 'v360_msg_put_buffer' is filled.
            // . Case 2: The request is invoked immediatly with the current 'v360_msg_put_buffer'.
            //CASE 1 : Delayed call to Augmented Operator server
            if (parseInt(config.arserverbufferinterval) > 0 && v360_msg_buffer_send_toggle) {
                setTimeout(function () { augmentedOp_http_request(msg, config); }, config.arserverbufferinterval);
                //Toggle off v360_msg_buffer_send_toggle:
                context.set('v360_msg_buffer_send_toggle', false);
            }
            //CASE 2 : Immediate call to Augmented Operator server
            else if (parseInt(config.arserverbufferinterval) === 0) {
                augmentedOp_http_request(msg, config);
            }
        });
        this.on("close", function () {
            node.status({});
        });
    }
    //Register in node-red the two nodes specified in the current source file:
    RED.nodes.registerType("Augmented-Operator-variable", arservervariablenode);
    RED.nodes.registerType("Augmented-Operator-server", arservernode);
};
