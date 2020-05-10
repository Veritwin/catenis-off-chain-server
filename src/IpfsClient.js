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
const ipfsHttpClientLib = {
    configure: require('ipfs-http-client/src/lib/configure'),
    toUrlSearchParams: require('ipfs-http-client/src/lib/to-url-search-params')
};

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {
    wrapAsyncPromise,
    wrapAsyncIterable,
    asyncIterableToArray,
    asyncIterableToBuffer
} from './Util';

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

    // noinspection JSUnresolvedVariable
    this.api = {
        add: wrapAsyncIterable(this.ipfs.add, asyncIterableToArray, this.ipfs),
        cat: wrapAsyncIterable(this.ipfs.cat, asyncIterableToBuffer, this.ipfs),
        catReadableStream: wrapAsyncIterable(this.ipfs.cat, toStream.readable, this.ipfs),
        id: wrapAsyncPromise(this.ipfs.id, this.ipfs),
        ls: wrapAsyncIterable(this.ipfs.ls, asyncIterableToArray, this.ipfs),
        files: {
            ls: wrapAsyncIterable(this.ipfs.files.ls, asyncIterableToArray, this.ipfs),
            mkdir: wrapAsyncPromise(this.ipfs.files.mkdir, this.ipfs),
            stat: wrapAsyncPromise(this.ipfs.files.stat, this.ipfs),
            cp: wrapAsyncPromise(this.ipfs.files.cp, this.ipfs),
            write: wrapAsyncPromise(this.ipfs.files.write, this.ipfs),
            rm: wrapAsyncPromise(this.ipfs.files.rm, this.ipfs, this.ipfs)
        },
        pin: {
            add: wrapAsyncPromise(this.ipfs.pin.add, this.ipfs),
            update: wrapAsyncPromise(this.ipfs.pin.update, this.ipfs),
            rm: wrapAsyncPromise(this.ipfs.pin.rm, this.ipfs),
            ls: wrapAsyncIterable(this.ipfs.pin.ls, asyncIterableToArray, this.ipfs)
        }
    };
}


// Public IpfsClient object methods
//

IpfsClient.prototype.add = function (data, options) {
    try {
        return this.api.add(data, options);
    }
    catch (err) {
        handleError('add', err);
    }
};

IpfsClient.prototype.cat = function (ipfsPath, callback) {
    if (callback) {
        this.api.cat(ipfsPath).then(result => {
            callback(null, result);
        }, err => {
            handleError('cat', err, true, callback);
        });
    }
    else {
        try {
            return this.api.cat(ipfsPath);
        }
        catch (err) {
            handleError('cat', err);
        }
    }
};

IpfsClient.prototype.catReadableStream = function (ipfsPath) {
    try {
        return this.api.catReadableStream(ipfsPath);
    }
    catch (err) {
        handleError('catReadableStream', err);
    }
};

IpfsClient.prototype.id = function () {
    try {
        return this.api.id();
    }
    catch (err) {
        handleError('id', err);
    }
};

IpfsClient.prototype.ls = function (ipfsPath, logError = false) {
    try {
        return this.api.ls(ipfsPath);
    }
    catch (err) {
        handleError('ls', err, logError);
    }
};

IpfsClient.prototype.filesLs = function (path, options) {
    try {
        return this.api.files.ls(path, options);
    }
    catch (err) {
        handleError('filesLs', err);
    }
};

IpfsClient.prototype.filesMkdir = function (path, options) {
    try {
        return this.api.files.mkdir(path, options);
    }
    catch (err) {
        handleError('filesMkdir', err);
    }
};

IpfsClient.prototype.filesStat = function (path, options, logError = false) {
    try {
        return this.api.files.stat(path, options);
    }
    catch (err) {
        handleError('filesStat', err, logError);
    }
};

IpfsClient.prototype.filesCp = function (from, to, options) {
    try {
        return this.api.files.cp(from, to, options);
    }
    catch (err) {
        handleError('filesCp', err);
    }
};

IpfsClient.prototype.filesWrite = function (path, content, options) {
    try {
        return this.api.files.write(path, content, options);
    }
    catch (err) {
        handleError('filesWrite', err);
    }
};

IpfsClient.prototype.filesRm = function (path, options) {
    try {
        return this.api.files.rm(path, options);
    }
    catch (err) {
        handleError('filesRm', err);
    }
};

IpfsClient.prototype.pinAdd = function (hash, options) {
    try {
        return this.api.pin.add(hash, options);
    }
    catch (err) {
        handleError('pinAdd', err);
    }
};

IpfsClient.prototype.pinUpdate = function (fromHash, toHash, options) {
    try {
        return this.api.pin.update(fromHash, toHash, options);
    }
    catch (err) {
        handleError('pinUpdate', err);
    }
};

IpfsClient.prototype.pinRm = function (hash, options) {
    try {
        return this.api.pin.rm(hash, options);
    }
    catch (err) {
        handleError('pinRm', err);
    }
};

IpfsClient.prototype.pinLs = function (hash, options) {
    try {
        return this.api.pin.ls(hash, options);
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
