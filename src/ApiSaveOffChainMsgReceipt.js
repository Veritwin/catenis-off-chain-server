/**
 * Created by claudio on 2019-11-26
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import resError from 'restify-errors';
import ctnOffChainLib from 'catenis-off-chain-lib';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {IpfsRepo} from './IpfsRepo';


// Definition of module (private) functions
//

// Method used to process POST '/msg-data/receipt' endpoint of REST API
//
//  JSON payload: {
//    "data': [String], Off-Chain message receipt data as a base64-encoded binary stream
//    "immediateRetrieval": [Boolean] (optional, default: false) Indicates whether saved off-chain message receipt
//                                     should be immediately retrieved
//  }
//
//  Success data returned: {
//    "status": "success",
//    "data": {
//      "cid": [String], IPFS CID of the saved off-chain message receipt
//      "savedDate": [String] ISO-8601 formatted date and time when off-chain message receipt has been saved
//    }
//  }
//
export function saveOffChainMsgReceipt(req, res, next) {
    (async () => {
        if (res.claimUpgrade) {
            return new resError.ForbiddenError('Endpoint does not allow for connection upgrade');
        }

        if (!this.canProcess()) {
            return new resError.ServiceUnavailableError('Service unavailable');
        }

        if (req.getContentType() !== 'application/json') {
            return new resError.UnsupportedMediaTypeError('Unsupported media type');
        }

        if (!(typeof req.body === 'object' && req.body !== null)) {
            return new resError.BadRequestError('Missing body parameters');
        }

        const bufMsgReceipt = validateOffChainMsgReceipt(req.body.data);

        if (!bufMsgReceipt) {
            return new resError.BadRequestError('Missing or invalid body parameters');
        }

        const retrieveImmediately = !!req.body.immediateRetrieval;

        // Save off-chain message data onto IPFS repository
        const saveResult = await CtnOCSvr.ipfsRepo.saveOffChainMsgData(bufMsgReceipt, IpfsRepo.offChainMsgDataRepo.msgReceipt, retrieveImmediately);

        res.send({
            status: 'success',
            data: saveResult
        });
    })()
    .then(result => {
        next(result);
    }, err => {
        CtnOCSvr.logger.ERROR('Error processing POST \'/msg-data/receipt\' API request.', err);
        return next(new resError.InternalServerError('Internal server error'));
    });
}

function validateOffChainMsgReceipt(data) {
    if (typeof data === 'string') {
        let msgReceipt;
        let bufData;

        try {
            bufData = Buffer.from(data, 'base64');
            msgReceipt = ctnOffChainLib.MessageReceipt.fromBuffer(bufData);
        }
        catch (err) {
            CtnOCSvr.logger.DEBUG('saveOffChainMsgReceipt: `data` body parameter is not a valid Catenis off-chain message receipt');
        }

        if (msgReceipt) {
            if (msgReceipt.isSigned) {
                if (msgReceipt.verifySignature()) {
                    return bufData;
                }
                else {
                    CtnOCSvr.logger.DEBUG('saveOffChainMsgReceipt: `data` body parameter contains a Catenis off-chain message receipt with an invalid signature');
                }
            }
            else {
                CtnOCSvr.logger.DEBUG('saveOffChainMsgReceipt: `data` body parameter contains a Catenis off-chain message receipt that is not signed');
            }
        }
    }
    else {
        CtnOCSvr.logger.DEBUG('saveOffChainMsgReceipt: invalid type of `data` body parameter [%s]', data);
    }

    return false;
}
