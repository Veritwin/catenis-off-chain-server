/**
 * Created by claudio on 2019-11-21
 */

// Module variables
//

// References to external code
//
// Internal node modules
import util from 'util';
// Third-party node modules
import config from 'config';
import toStream from 'it-to-stream';
import ipfsHttpClient from 'ipfs-http-client';
import ihcConfig from 'ipfs-http-client/src/lib/configure.js';
import ihcSearchParams from 'ipfs-http-client/src/lib/to-url-search-params.js';
const ipfsHttpClientLib = {
    configure: ihcConfig,
    toUrlSearchParams: ihcSearchParams
};

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';
import {
    asyncIterableToArray,
    asyncIterableToBuffer
} from './Util.js';

// Config entries
const ipfsClientConfig = config.get('ipfsClient');

// Configuration settings
const cfgSettings = {
    apiHost: ipfsClientConfig.get('apiHost'),
    apiPort: ipfsClientConfig.get('apiPort'),
    apiProtocol: ipfsClientConfig.get('apiProtocol')
};


// Definition of function classes
//

// IpfsClient function class
export function IpfsClient(host, port, protocol) {
    this.ipfsClientConfig = {
        host: host,
        port: port,
        protocol: protocol
    };
    this.ipfs = ipfsHttpClient(this.ipfsClientConfig);

    addMissingIpfsMethods.call(this);
}


// Public IpfsClient object methods
//

IpfsClient.prototype.add = async function (data, options) {
    try {
        return await this.ipfs.add(data, options);
    }
    catch (err) {
        handleError('add', err);
    }
};

IpfsClient.prototype.cat = async function (ipfsPath) {
    try {
        return await asyncIterableToBuffer(this.ipfs.cat(ipfsPath));
    }
    catch (err) {
        handleError('cat', err);
    }
};

IpfsClient.prototype.catReadableStream = function (ipfsPath) {
    try {
        return toStream.readable(this.ipfs.cat(ipfsPath));
    }
    catch (err) {
        handleError('catReadableStream', err);
    }
};

IpfsClient.prototype.id = async function () {
    try {
        return await this.ipfs.id();
    }
    catch (err) {
        handleError('id', err);
    }
};

IpfsClient.prototype.ls = async function (ipfsPath, logError = false) {
    try {
        return await asyncIterableToArray(this.ipfs.ls(ipfsPath));
    }
    catch (err) {
        handleError('ls', err, logError);
    }
};

IpfsClient.prototype.filesLs = async function (path, options) {
    try {
        return await asyncIterableToArray(this.ipfs.files.ls(path, options));
    }
    catch (err) {
        handleError('filesLs', err);
    }
};

IpfsClient.prototype.filesMkdir = async function (path, options) {
    try {
        return await this.ipfs.files.mkdir(path, options);
    }
    catch (err) {
        handleError('filesMkdir', err);
    }
};

IpfsClient.prototype.filesStat = async function (path, options, logError = false) {
    try {
        return await this.ipfs.files.stat(path, options);
    }
    catch (err) {
        handleError('filesStat', err, logError);
    }
};

IpfsClient.prototype.filesCp = async function (from, to, options) {
    try {
        return await this.ipfs.files.cp(from, to, options);
    }
    catch (err) {
        handleError('filesCp', err);
    }
};

IpfsClient.prototype.filesWrite = async function (path, content, options) {
    try {
        return await this.ipfs.files.write(path, content, options);
    }
    catch (err) {
        handleError('filesWrite', err);
    }
};

IpfsClient.prototype.filesRm = async function (path, options) {
    try {
        return await this.ipfs.files.rm(path, options);
    }
    catch (err) {
        handleError('filesRm', err);
    }
};

IpfsClient.prototype.pinAdd = async function (hash, options) {
    try {
        return await this.ipfs.pin.add(hash, options);
    }
    catch (err) {
        handleError('pinAdd', err);
    }
};

IpfsClient.prototype.pinUpdate = async function (fromHash, toHash, options) {
    try {
        return await this.ipfs.pin.update(fromHash, toHash, options);
    }
    catch (err) {
        handleError('pinUpdate', err);
    }
};

IpfsClient.prototype.pinRm = async function (hash, options) {
    try {
        return await this.ipfs.pin.rm(hash, options);
    }
    catch (err) {
        handleError('pinRm', err);
    }
};

IpfsClient.prototype.pinLs = async function (options) {
    try {
        return await asyncIterableToArray(this.ipfs.pin.ls(options));
    }
    catch (err) {
        handleError('pinLs', err);
    }
};


// Module functions used to simulate private IpfsClient object methods
//  NOTE: these functions need to be bound to a IpfsClient object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

function addMissingIpfsMethods() {
    addMissingPinUpdateMethod.call(this);
}

function addMissingPinUpdateMethod() {
    this.ipfs.pin.update = ipfsHttpClientLib.configure(api => {
        return async (hash1, hash2, options = {}) => {
            if (options.unpin != null) {
                options.unpin = `${options.unpin}`;
            }

            const res = await (await api.post('pin/update', {
                timeout: options.timeout,
                signal: options.signal,
                searchParams: ipfsHttpClientLib.toUrlSearchParams({
                    arg: [`${hash1}`, `${hash2}`],
                    ...options
                }),
                headers: options.headers
            })).json()

            return (res.Pins || []).map(cid => ({ cid: new ipfsHttpClient.CID(cid) }))
        }
    })(this.ipfsClientConfig);
}


// IpfsClient function class (public) methods
//

IpfsClient.initialize = function () {
    CtnOCSvr.logger.TRACE('IpfsClient initialization');
    // Instantiate IpfsClient object
    CtnOCSvr.ipfsClient = new IpfsClient(cfgSettings.apiHost, cfgSettings.apiPort, cfgSettings.apiProtocol);
};


// IpfsClient function class (public) properties
//

/*IpfsClient.prop = {};*/


// Definition of module (private) functions
//

function handleError(methodName, err, logError = false, callback) {
    let errMsg = util.format('Error calling IPFS API \'%s\' method: %s', methodName, err.message);

    if (logError) {
        // Log error
        CtnOCSvr.logger.DEBUG(errMsg, err);
    }

    // Rethrow error
    const error = new Error(errMsg);
    error._ipfsError = err;

    if (callback) {
        callback(error);
    }
    else {
        throw error;
    }
}


// Module code
//

// Lock function class
Object.freeze(IpfsClient);
