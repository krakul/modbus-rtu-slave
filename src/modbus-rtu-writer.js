const util = require("util");
module.exports = function (RED) {
    'use strict'

    const Modbus = require('jsmodbus')
    const SerialPort = require('serialport')

    function ModbusRTUWriter(config) {
        // --------------------
        // Prepare state:

        RED.nodes.createNode(this, config);
        const node = this

        node.register = parseInt(config.register)
        node.inputType = config.inputType

        node.on('input', function (msg, send, done) {
            let sendMsg = {}
            sendMsg["payload"] = {}
            sendMsg["payload"]["register"] = node.register
            sendMsg["payload"]["data"] = []

            let data = sendMsg["payload"]["data"]
            if (node.inputType === 'Bool') {
                data.push(msg['payload'])
            } else if (node.inputType === 'U16') {
                data.push(msg['payload'])
            } else if (node.inputType === 'U32') {
                // TODO: Finish interface between Writer and Slave.
                data.push(msg['payload'] && 0xFF00)
                data.push(msg['payload'] && 0x00FF)
            } else {
                node.error('unsupported inputType: ' + node.inputType)
            }
            node.send(sendMsg)
        })
    }

    try {
        RED.nodes.registerType("Modbus-RTU-Writer", ModbusRTUWriter);
    } catch (err) {
        console.error(err)
    }
}