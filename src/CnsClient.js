/**
 * Created by claudio on 2019-11-20
 */

// Module variables
//

// References to external code
//
// Internal node modules
import util from 'util';
// Third-party node modules
import config from 'config';
import restifyClients from 'restify-clients';
import httpSignature from 'http-signature';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';
import {ctnNode} from './CtnNode.js';
import {callbackToPromise} from './Util.js';

// Config entries
const cnsClientConfig = config.get('cnsClient');

// Configuration settings
const cfgSettings = {
    connectTimeout: cnsClientConfig.get('connectTimeout'),
    requestTimeout: cnsClientConfig.get('requestTimeout'),
    hostFormat: cnsClientConfig.get('hostFormat'),
    headersToSign: cnsClientConfig.get('headersToSign')
};


// Definition of function classes
//

// CnsClient function class
export function CnsClient(cnsInstanceInfo) {
    this.cnsInstanceInfo = cnsInstanceInfo;
    // NOTE: we are using the `agent: false` option below to avoid ECONNRESET and socket hangup
    //  errors when calling the CNS API methods repeatedly with a short time interval
    this.client = new restifyClients.createJSONClient({
        connectTimeout: cfgSettings.connectTimeout,
        requestTimeout: cfgSettings.requestTimeout,
        retry: false,
        signRequest: httpSignRequest,
        url: assembleUrl(cnsInstanceInfo),
        agent: false
    });
    this.promGet = callbackToPromise(this.client.get, this.client);
    this.promPost = callbackToPromise(this.client.post, this.client);
}


// Public CnsClient object methods
//

CnsClient.prototype.getIpfsRepoRootCid = async function (ctnNodeIdx) {
    return (await this.promGet(`/ctn-node/${ctnNodeIdx}/ipfs-root`))[2].data;
};

CnsClient.prototype.getAllIpfsRepoRootCids = async function (updatedSince) {
    let endpointUrl = '/ctn-node/ipfs-root';

    if (updatedSince instanceof Date) {
        endpointUrl += '?updatedSince=' + updatedSince.toISOString();
    }

    return (await this.promGet(endpointUrl))[2].data;
};

CnsClient.prototype.setIpfsRepoRootCid = async function (ctnNodeIdx, cid, lastUpdatedDate) {
    const data = {
        cid: cid
    };

    if (lastUpdatedDate) {
        data.lastUpdatedDate = lastUpdatedDate;
    }

    await this.promPost(`/ctn-node/${ctnNodeIdx}/ipfs-root`, data);
};

// Arguments:
//  ctnNodeEntries: {
//    <ctnNodeIdx>: {
//      cid: [String],
//      lastUpdatedDate: [Date]
//    },
//    ...
//  }
CnsClient.prototype.setMultiIpfsRepoRootCid = async function (ctnNodeEntries) {
    await this.promPost('/ctn-node/ipfs-root', ctnNodeEntries);
};


// Module functions used to simulate private CnsClient object methods
//  NOTE: these functions need to be bound to a CnsClient object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

/*function priv_func() {
}*/


// CnsClient function class (public) methods
//

/*CnsClient.class_func = function () {
};*/


// CnsClient function class (public) properties
//

//CnsClient.prop = {};


// Definition of module (private) functions
//

function assembleUrl(cnsInstanceInfo) {
    return 'http' + (cnsInstanceInfo.secure ? 's' : '') + '://' + util.format(cfgSettings.hostFormat, cnsInstanceInfo.idx, CtnOCSvr.app.domainRoot) + ':' + cnsInstanceInfo.port;
}

function httpSignRequest(req) {
    httpSignature.sign(req, {
        keyId: ctnNode.id,
        key: ctnNode.privKey,
        headers: cfgSettings.headersToSign
    });
}


// Module code
//
