/**
 * Created by claudio on 2019-12-05
 */
// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import config from 'config';
import WebSocket from 'ws';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';

// Config entries
const clientNtfyConfig = config.get('clientNotification');

// Configuration settings
const cfgSettings = {
    heartbeatInterval: clientNtfyConfig.get('heartbeatInterval'),
    message: {
        newOffChainMsgData: clientNtfyConfig.get('message.newOffChainMsgData')
    }
};


// Definition of function classes
//

// ClientNotification function class
export function ClientNotification() {
    this.webSocketServer = new WebSocket.Server({
        noServer: true
    });

    // noinspection JSUnusedLocalSymbols
    this.webSocketServer.on('connection', (ws, req) => {
        ws.on('close', function (code, reason) {
            CtnOCSvr.logger.TRACE('WebSocket connect closed: [%d] %s', code, reason);
        });

        ws.on('open', function () {
            CtnOCSvr.logger.TRACE('New WebSocket connection established');
        });

        ws.on('error', function (error) {
            CtnOCSvr.logger.ERROR('Error occurred on WebSocket connection.', error);
        });

        ws.isAlive = true;

        ws.on('pong', function () {
            CtnOCSvr.logger.TRACE('Pong received for WebSocket connection');
            this.isAlive = true;
        });
    });

    // Prepare to send heartbeat
    this.heartbeatInterval = setInterval(() => {
        this.webSocketServer.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                // Client failed to send heartbeat response in time. Assume WebSocket
                //  connection is broken and terminate it
                CtnOCSvr.logger.DEBUG('Client failed to send heartbeat response in time. Terminating WebSocket connection');
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, cfgSettings.heartbeatInterval);
}


// Public Application object methods
//


ClientNotification.prototype.notifyNewOffChainMsgData = function () {
    // Broadcast message notifying that new off-chain data has been retrieved
    this.webSocketServer.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(cfgSettings.message.newOffChainMsgData);
        }
    })
};


// Module functions used to simulate private ClientNotification object methods
//  NOTE: these functions need to be bound to a ClientNotification object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//


// Application function class (public) methods
//

ClientNotification.initialize = function () {
    CtnOCSvr.logger.TRACE('ClientNotification initialization');
    CtnOCSvr.clientNotifier = new ClientNotification();
};


// Definition of module (private) functions
//


// Module code
//
