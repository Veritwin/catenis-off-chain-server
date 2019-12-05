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
import resError from 'restify-errors';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';


// Definition of module (private) functions
//

// Method used to process GET (UPGRADE) '/notify' endpoint of REST API
//
//  NOTE: this is a special API endpoint used to establish a WebSocket connection
//         that is used for client notification
//
export function upgradeClientNotification(req, res, next) {
    try {
        if (!res.claimUpgrade) {
            return next(new resError.UpgradeRequiredError());
        }

        // Establish WebSocket protocol connection
        const upgrade = res.claimUpgrade();

        CtnOCSvr.clientNotifier.webSocketServer.handleUpgrade(req, upgrade.socket, upgrade.head, (ws) => {
            CtnOCSvr.clientNotifier.webSocketServer.emit('connection', ws, req);
        });

        return next();
    }
    catch (err) {
        CtnOCSvr.logger.ERROR('Error processing GET (UPGRADE) \'/notify\' API request.', err);
        return next(new resError.InternalServerError('Internal server error'));
    }
}
