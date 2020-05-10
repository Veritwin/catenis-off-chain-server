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
import ipfsHttpClient from 'ipfs-http-client';
import callbackify from 'callbackify';
const ipfsHttpClientConfigure = require('ipfs-http-client/src/lib/configure');

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {wrapAsync} from './Util';

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
        add: wrapAsync(this.ipfs.add, this.ipfs),
        cat: wrapAsync(this.ipfs.cat, this.ipfs),
        catReadableStream: this.ipfs.catReadableStream,
        id: wrapAsync(this.ipfs.id, this.ipfs),
        ls: wrapAsync(this.ipfs.ls, this.ipfs),
        files: {
            ls: wrapAsync(this.ipfs.files.ls, this.ipfs),
            mkdir: wrapAsync(this.ipfs.files.mkdir, this.ipfs),
            stat: wrapAsync(this.ipfs.files.stat, this.ipfs),
            cp: wrapAsync(this.ipfs.files.cp, this.ipfs),
            write: wrapAsync(this.ipfs.files.write, this.ipfs)
        },
        pin: {
            add: wrapAsync(this.ipfs.pin.add, this.ipfs),
            update: wrapAsync(this.ipfs.pin.update, this.ipfs),
            rm: wrapAsync(this.ipfs.pin.rm, this.ipfs)
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
        this.api.cat(ipfsPath, function (err, result) {
            if (err) {
                handleError('cat', err, true, callback);
            }
            else {
                callback(null, result);
            }
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


// Module functions used to simulate private IpfsClient object methods
//  NOTE: these functions need to be bound to a IpfsClient object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

function addMissingIpfsMethods() {
    addMissingPinUpdateMethod.call(this);
}

function addMissingPinUpdateMethod() {
    this.ipfs.pin.update = callbackify.variadic(ipfsHttpClientConfigure(({ ky }) => {
        return async (hash1, hash2, options) => {
            options = options || {};

            const searchParams = new URLSearchParams(options.searchParams);
            searchParams.set('arg', `${hash1}`);
            searchParams.append('arg', `${hash2}`);
            if (options.unpin != null) searchParams.set('unpin', options.unpin ? 'true' : 'false');

            const res = await ky.post('pin/update', {
                timeout: options.timeout,
                signal: options.signal,
                headers: options.headers,
                searchParams
            }).json();

            return (res.Pins || []).map(hash => ({ hash }));
        }
    })(this.ipfsClientConfig));
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
