/**
 * Created by claudio on 2019-12-11
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import config from 'config';
import resError from 'restify-errors';
import moment from 'moment';
import Future from 'fibers/future';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {strictParseInt} from './Util';

// Config entries
const apiConfig = config.get('apiGetOffChainMsgData');

// Configuration settings
export const cfgSettings = {
    maxItemsCount: apiConfig.get('maxItemsCount')
};


// Definition of module (private) functions
//

// Method used to process GET '/msg-data/:cid' endpoint of REST API
//
//  Query string (optional) parameters:
//    includeSavedOnly [Boolean] (default: false) Indicates whether it should also look for off-chain message data that
//                                have been saved (by this Catenis node) but not yet retrieved
//
//  URL parameters:
//    cid [String] - IPFS CID of the off-chain message data being requested
//
//  Success data returned: {
//    "status": "success",
//    "data": {
//      "cid": [String], IPFS CID of the off-chain message data
//      "data": [String], Off-Chain message data as a base64-encoded binary stream
//      "dataType": [String], Type of off-chain message data; either 'msg-envelope' or 'msg-receipt'
//      "savedDate": [String], ISO-8601 formatted date and time when off-chain message data has originally been saved
//      "retrievedDate": [String] (optional) ISO-8601 formatted date and time when off-chain message data has been retrieved.
//                                 Note that this field will not be returned if 'includeSavedOnly' is true and off-chain message data is not yet retrieved.
//    }
//  }
//
export function getSingleOffChainMsgData(req, res, next) {
    // Make sure that code runs in its own fiber
    Future.task(() => {
        if (res.claimUpgrade) {
            return new resError.ForbiddenError('Endpoint does not allow for connection upgrade');
        }

        if (!this.canProcess()) {
            return new resError.ServiceUnavailableError('Service unavailable');
        }

        if (!checkRequestParams(req)) {
            return new resError.BadRequestError('Missing or invalid request parameters');
        }

        const msgData = CtnOCSvr.ipfsRepo.getRetriedOffChainMsgDataByCid(req.params.cid, req.params.includeSavedOnly);

        if (msgData) {
            res.send({
                status: 'success',
                data: msgData
            });
        }
        else {
            return new resError.BadRequestError('No off-chain message data found with the given CID');
        }
    }).resolve((err, result) => {
        if (err) {
            CtnOCSvr.logger.ERROR('Error processing GET \'/msg-data/:cid\' API request.', err);
            next(new resError.InternalServerError('Internal server error'));
        }
        else {
            next(result);
        }
    });
}

function checkRequestParams(req) {
    let valid = true;

    if (req.params.includeSavedOnly) {
        const val = parseBoolean(req.params.includeSavedOnly);

        if (val !== null) {
            req.params.includeSavedOnly = val;
        }
        else {
            CtnOCSvr.logger.DEBUG('getSingleOffChainMsgData: invalid `includeSavedOnly` query parameter [%s]', req.params.includeSavedOnly);
            valid = false;
        }
    }
    else {
        req.params.includeSavedOnly = false;
    }

    if (!req.params.cid || req.params.cid.length === 0) {
        CtnOCSvr.logger.DEBUG('getSingleOffChainMsgData: missing `cid` request parameter');
        valid = false;
    }

    return valid;
}

function parseBoolean(val) {
    return typeof val !== 'string' ? null : (val === '1' || val.toLowerCase() === 'true' ? true : (val === '0' || val.toLowerCase() === 'false' ? false : null));
}
