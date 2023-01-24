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
        node.convertToLocal = config.convertToLocal

        node.on('input', function (msg, send, done) {
            let sendMsg = {}
            sendMsg["payload"] = {}
            sendMsg["payload"]["register"] = node.register
            sendMsg["payload"]["convertToLocal"] = node.convertToLocal
            sendMsg["payload"]["data"] = []

            let data = sendMsg["payload"]["data"]
            if (node.inputType === '1bit') {
                data.push(msg['payload'])
            } else if (node.inputType === '16bit') {
                data.push(new Uint16Array([msg['payload']])[0])
            } else if (node.inputType === '32bit') {
                // Convert to two U16 in big-endian:
                let num = msg['payload']
                let arr = new Uint16Array([(num & 0xFFFF0000) >> 16, (num & 0x0000FFFF) ])
                data.push(arr[0])
                data.push(arr[1])
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