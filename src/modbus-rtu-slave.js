const util = require("util");
module.exports = function (RED) {
    'use strict'

    const Modbus = require('jsmodbus')
    const SerialPort = require('serialport')

    function ModbusRTUSlave(config) {
        // --------------------
        // Prepare state:

        RED.nodes.createNode(this, config);
        const node = this;
        const bufferSizeFactor = 2 // uint16

        node.slaveId = parseInt(config.slaveId)
        node.serialPort = config.serialPort
        node.baudRate = parseInt(config.baudRate)
        node.coilsBufferSize = parseInt(config.coilsBufferSize) * bufferSizeFactor
        node.discreteBufferSize = parseInt(config.discreteBufferSize) * bufferSizeFactor
        node.holdingBufferSize = parseInt(config.holdingBufferSize) * bufferSizeFactor
        node.inputBufferSize = parseInt(config.inputBufferSize) * bufferSizeFactor
        node.showErrors = config.showErrors
        node.logEnabled = config.logEnabled
        node.port = null
        node.server = null
        node.portPeriodicUpdateIntervalId = null

        node.showConnectedStatus = function () {
            node.status({fill: "green", shape: "dot", text: "connected"});
        }

        node.showDisconnectedStatus = function () {
            node.status({fill: "red", shape: "ring", text: "disconnected"});
        }

        node.logError = function(err) {
            if (err) {
                if (node.showErrors) {
                    node.error(err)
                } else {
                    console.error(err)
                }
            }
        }

        node.portPeriodicUpdate = function () {
            if (node.port.isOpen) {
                node.showConnectedStatus()
            } else {
                node.showDisconnectedStatus()
                node.port.open(function (err) {
                    node.logError(err)
                })
            }
        }

        // --------------------
        // Attempt connection:

        node.connect = function () {
            node.showDisconnectedStatus()

            try {
                // Open port:
                node.port = new SerialPort(node.serialPort, {
                    baudRate: node.baudRate,
                    autoOpen: false
                })
                node.port.on('error', function (err) {
                    node.logError(err)
                })
                node.portPeriodicUpdateIntervalId = setInterval(node.portPeriodicUpdate, 2000)

                // Open server:
                node.server = new Modbus.server.RTU(node.port, {
                    coils: Buffer.alloc(node.coilsBufferSize, 0),
                    discrete: Buffer.alloc(node.discreteBufferSize, 0),
                    holding: Buffer.alloc(node.holdingBufferSize, 0),
                    input: Buffer.alloc(node.inputBufferSize, 0),
                    slaveId: node.slaveId,
                    logEnabled: node.logEnabled
                })
                node.server.on('error', function (err) {
                    node.logError(err)
                })
                node.server.on('anyRequest', function (request) {
                    node.debug("server communication detected: " + JSON.stringify(request))
                    const msg = {}
                    msg.payload = util.inspect(request)
                    node.send(msg)
                })

            } catch (err) {
                node.logError(err)
            }
        }

        node.connect()

        node.on('input', function (msg, send, done) {
            // TODO: Finish input handling for all registers depending on requirements.

            const func = msg['payload']['function']
            const address = msg['payload']['address']

            if (func === 'writeMultipleRegisters') {
                const values = msg['payload']['values']
                node.server.injectWriteMultipleRegisters(address, values)
            }
        })

        node.on('close', function (done) {
            clearInterval(node.portPeriodicUpdateIntervalId)
            if (node.port) {
                node.port.close(() => {
                    done()
                })
            }
            node.server = null
            node.showDisconnectedStatus()
        })
    }

    try {
        RED.nodes.registerType("Modbus-RTU-Slave", ModbusRTUSlave);
    } catch (err) {
        console.error(err)
    }
}