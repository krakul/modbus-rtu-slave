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
        const bufferSize = 50000
        const bufferSizeFactor = 2 // uint16

        const coilsOffset = 1
        const discreteOffset = 10001
        const inputOffset = 30001
        const holdingOffset = 40001

        node.slaveId = parseInt(config.slaveId)
        node.serialPort = config.serialPort
        node.baudRate = parseInt(config.baudRate)
        node.dataBits = parseInt(config.dataBits)
        node.stopBits = parseInt(config.stopBits)
        node.parity = config.parity
        node.coilsBufferSize = bufferSize * bufferSizeFactor
        node.discreteBufferSize = bufferSize * bufferSizeFactor
        node.inputBufferSize = bufferSize * bufferSizeFactor
        node.holdingBufferSize = bufferSize * bufferSizeFactor
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
                    dataBits: node.dataBits,
                    stopBits: node.stopBits,
                    parity: node.parity,
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
                    input: Buffer.alloc(node.inputBufferSize, 0),
                    holding: Buffer.alloc(node.holdingBufferSize, 0),
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
            node.error(msg)

            const registerNum = msg['payload']['register']
            if (typeof registerNum !== 'number') {
                node.logError("invalid register: " + registerNum)
                return
            }

            let convertToLocal = msg['payload']['convertToLocal']
            if (typeof convertToLocal === 'undefined') {
                convertToLocal = false
            }


            // convert register number to buffer-local address and pick the correct buffer:
            let localAddress = registerNum
            let buffer
            if (registerNum < discreteOffset) {
                // coils
                node.error("updating coils")
                if (convertToLocal) {
                    localAddress = registerNum - coilsOffset
                }
                buffer = node.server.coils
            } else if (registerNum < inputOffset) {
                // discrete
                node.error("updating discrete")
                if (convertToLocal) {
                    localAddress = registerNum - discreteOffset
                }
                buffer = node.server.discrete
            } else if (registerNum < holdingOffset) {
                // input
                node.error("updating input")
                if (convertToLocal) {
                    localAddress = registerNum - inputOffset
                }
                buffer = node.server.input
            } else {
                // holding
                node.error("updating holding")
                if (convertToLocal) {
                    localAddress = registerNum - holdingOffset
                }
                buffer = node.server.holding
            }

            // in case of coils/discrete registers, the data field must contain an array of bools
            // in case of input/holding registers, the data field must contain an array of uint16s
            let data = msg['payload']['data']
            if (typeof data !== 'object') {
                node.logError("invalid data: " + data)
                return
            }

            // This implementation is inspired by the node-modbus implementation in order to be compatible with it:
            if (registerNum >= inputOffset) { // uint16s in these registers:
                // convert array of numbers to uint16s:
                let bfr = Buffer.alloc(data.length * bufferSizeFactor)
                data.forEach((v, i) => {
                    bfr.writeUInt16BE(v, i * bufferSizeFactor)
                })
                node.logError('writing ' + bfr.toString('hex') + ' to address ' + localAddress)
                // copy uint16s into buffer:
                localAddress *= bufferSizeFactor
                buffer.fill(new Uint8Array(bfr), localAddress, localAddress + data.length * bufferSizeFactor)
            } else { // bools in these registers:
                for (let i = 0; i < data.length; i++) {
                    const oldValue = buffer.readUInt8(Math.floor(localAddress / 8))
                    let newValue
                    if (data[i]) { // set bit
                        newValue = oldValue | Math.pow(2, localAddress % 8)
                    } else { // clear bit
                        newValue = oldValue & ~Math.pow(2, localAddress % 8)
                    }
                    node.logError('writing ' + newValue + ' to address ' + localAddress)
                    buffer.writeUInt8(newValue, Math.floor(localAddress / 8))
                    localAddress++
                }
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