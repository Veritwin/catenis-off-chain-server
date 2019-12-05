/**
 * Created by claudio on 2019-11-25
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import config from 'config';
import restify from 'restify';
import resError from 'restify-errors';
import httpSignature from 'http-signature';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {ctnNode} from './CtnNode';
import {saveOffChainMsgEnvelope} from './ApiSaveOffChainMsgEnvelope';
import {saveOffChainMsgReceipt} from './ApiSaveOffChainMsgReceipt';
import {getOffChainMsgData} from './ApiGetOffChainMsgData';
import {upgradeClientNotification} from './ApiUpgradeClientNotification';

// Config entries
const restApiConfig = config.get('restApi');

// Configuration settings
export const cfgSettings = {
    port: restApiConfig.get('port'),
    host: restApiConfig.get('host')
};


// Definition of function classes
//

// RestApi function class
export function RestApi(port, host) {
    this.apiReady = false;

    const opts = {
        handleUpgrades: true
    };

    this.apiServer = new restify.createServer(opts);

    this.apiServer.use(restify.plugins.acceptParser(['application/json']));
    this.apiServer.use(restify.plugins.authorizationParser());
    this.apiServer.use(authenticateRequest);
    this.apiServer.use(restify.plugins.bodyParser({
        rejectUnknown: true
    }));
    this.apiServer.use(restify.plugins.queryParser({mapParams: true}));

    this.apiServer.on('restifyError', errorHandler);

    // Define API methods
    this.apiServer.post('/msg-data/envelope', saveOffChainMsgEnvelope.bind(this));
    this.apiServer.post('/msg-data/receipt', saveOffChainMsgReceipt.bind(this));
    this.apiServer.get('/msg-data', getOffChainMsgData.bind(this));
    this.apiServer.get('/notify', upgradeClientNotification.bind(this));

    this.apiServer.listen(port, host, () => {
        CtnOCSvr.logger.INFO('Catenis Off-Chain Server started at', this.apiServer.address());
        this.apiReady = true;
        CtnOCSvr.app.setRestApiStarted();
    });
}


// Public RestApi object methods
//

RestApi.prototype.canProcess = function () {
    return this.apiReady && CtnOCSvr.app.ready;
};

RestApi.prototype.shutdown = function () {
    if (this.apiReady) {
        this.apiServer.close((err) => {
            if (err) {
                CtnOCSvr.logger.ERROR('Error closing REST API connection', err);
            }

            CtnOCSvr.app.setRestApiStopped();
        });

        this.apiReady = false;
    }
    else {
        CtnOCSvr.app.setRestApiStopped();
    }
};


// Module functions used to simulate private RestApi object methods
//  NOTE: these functions need to be bound to a RestApi object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

/*function priv_func() {
}*/


// RestApi function class (public) methods
//

RestApi.initialize = function () {
    CtnOCSvr.logger.TRACE('RestApi initialization');
    CtnOCSvr.restApi = new RestApi(cfgSettings.port, cfgSettings.host);
};


// RestApi function class (public) properties
//

//RestApi.prop = {};


// Definition of module (private) functions
//

function authenticateRequest(req, res, next) {
    if (req.username === 'anonymous') {
        return next(new resError.UnauthorizedError('Authentication required'));
    }

    if (!req.authorization.signature) {
        return next(new resError.UnauthorizedError('Unsupported authentication method'));
    }

    if (req.username !== ctnNode.id) {
        CtnOCSvr.logger.ERROR('Error authenticating request: unexpected username [%s]', req.username);
        return next(new resError.UnauthorizedError('Invalid user credentials'));
    }

    if (!httpSignature.verifySignature(req.authorization.signature, ctnNode.pubKey)) {
        CtnOCSvr.logger.ERROR('Error authenticating request: failed to verify signature');
        return next(new resError.UnauthorizedError('Invalid user credentials'));
    }

    return next();
}

function errorHandler(req, res, err, cb) {
    err.toString = function () {
        return err.message ? err.message : err.code;
    };

    err.toJSON = function () {
        return {
            status: 'error',
            message: err.message ? err.message : err.code
        }
    };

    cb();
}


// Module code
//
