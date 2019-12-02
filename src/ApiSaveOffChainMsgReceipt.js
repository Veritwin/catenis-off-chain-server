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
import Future from 'fibers/future';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {IpfsRepo} from './IpfsRepo';


// Definition of module (private) functions
//

// Method used to process POST '/msg-data/receipt' endpoint of REST API
//
//  JSON payload: {
//    "data': [String] Off-Chain message receipt data as a base64-encoded binary stream
//  }
//
//  Success data returned: {
//    "status": "success"
//  }
//
export function saveOffChainMsgReceipt(req, res, next) {
    // Make sure that code runs in its own fiber
    // noinspection DuplicatedCode
    Future.task(() => {
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

        // Save off-chain message data onto IPFS repository
        CtnOCSvr.ipfsRepo.saveOffChainMsgData(bufMsgReceipt, IpfsRepo.offChainMsgDataType.msgReceipt);

        res.send({
            status: 'success'
        });
    }).resolve((err, result) => {
        if (err) {
            CtnOCSvr.logger.ERROR('Error processing POST \'/msg-data/receipt\' API request.', err);
            return next(new resError.InternalServerError('Internal server error'));
        }
        else {
            next(result);
        }
    });
}

function validateOffChainMsgReceipt(data) {
    if (typeof data === 'string') {
        let ocMsgReceipt;
        let bufData;

        try {
            bufData = Buffer.from(data, 'base64');
            ocMsgReceipt = ctnOffChainLib.MessageReceipt.fromBuffer(bufData);
        }
        catch (err) {
            CtnOCSvr.logger.DEBUG('saveOffChainMsgReceipt: `data` body parameter is not a valid Catenis off-chain message receipt');
        }

        if (ocMsgReceipt) {
            if (ocMsgReceipt.isSigned()) {
                if (ocMsgReceipt.verifySignature()) {
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
