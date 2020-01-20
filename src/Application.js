/**
 * Created by claudio on 2019-11-18
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import config from 'config';
import Future from 'fibers/future';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';

// Config entries
const appConfig = config.get('application');

// Configuration settings
const cfgSettings = {
    environment: appConfig.get('environment'),
    isTest: appConfig.get('isTest'),
    domain: appConfig.get('domain'),
    shutdownTimeout: appConfig.get('shutdownTimeout'),
    shutdownWithErrorTimeout: appConfig.get('shutdownWithErrorTimeout')
};


// Definition of function classes
//

// Application function class
export function Application() {
    this.ipfsRepoAutomationOn = false;
    this.restApiRunning = false;
    this.runningState = Application.runningState.starting;
    this.app_id = undefined;
    this.fatalError = false;

    // Set up handler to gracefully shutdown the application
    process.on('SIGTERM', processShutdown.bind(this));

    process.on('uncaughtException', shutdownWithError.bind(this));

    Object.defineProperties(this,{
        environment: {
            get: function () {
                return cfgSettings.environment;
            },
            enumerable: true
        },
        isTest: {
            get: function () {
                return cfgSettings.isTest;
            },
            enumerable: true
        },
        domainRoot: {
            get: function () {
                return envSubdomainPrefix(this.environment) + cfgSettings.domain;
            },
            enumerable: true
        },
        ready: {
            get: function () {
                // noinspection JSPotentiallyInvalidUsageOfThis
                return this.runningState === Application.runningState.ready;
            },
            enumerable: true
        },
        lastIpfsRepoRootCidsRetrievalDate: {
            get: function () {
                let docApp;

                // noinspection JSPotentiallyInvalidUsageOfThis
                if (this.app_id) {
                    // noinspection JSPotentiallyInvalidUsageOfThis
                    docApp = CtnOCSvr.db.collection.Application.findOne({_id: this.app_id}, {projection: {lastIpfsRepoRootCidsRetrievalDate: 1}});
                }
                else {
                    docApp = CtnOCSvr.db.collection.Application.findOne({}, {projection: {_id: 1, lastIpfsRepoRootCidsRetrievalDate: 1}});
                    // noinspection JSPotentiallyInvalidUsageOfThis
                    this.app_id = docApp._id;
                }

                return docApp.lastIpfsRepoRootCidsRetrievalDate !== null ? docApp.lastIpfsRepoRootCidsRetrievalDate : undefined;
            },
            set: function (value) {
                // noinspection JSPotentiallyInvalidUsageOfThis
                if (!this.app_id) {
                    // noinspection JSPotentiallyInvalidUsageOfThis
                    this.app_id = CtnOCSvr.db.collection.Application.findOne({}, {projection: {_id: 1}})._id;
                }

                // noinspection JSPotentiallyInvalidUsageOfThis
                CtnOCSvr.db.collection.Application.updateOne({_id: this.app_id}, {$set: {lastIpfsRepoRootCidsRetrievalDate: value}});
            },
            enumerable: true
        }
    });
}


// Public Application object methods
//

Application.prototype.setIpfsRepoAutomationOn = function () {
    if (!this.ipfsRepoAutomationOn) {
        this.ipfsRepoAutomationOn = true;

        if (checkInitComplete.call(this)) {
            startProcessing.call(this);
        }
    }
};

Application.prototype.setRestApiStarted = function () {
    if (!this.restApiRunning) {
        this.restApiRunning = true;

        if (checkInitComplete.call(this)) {
            startProcessing.call(this);
        }
    }
};

Application.prototype.setIpfsRepoAutomationOff = function () {
    if (this.ipfsRepoAutomationOn) {
        this.ipfsRepoAutomationOn = false;

        checkFinalizeShutdown.call(this);
    }
};

Application.prototype.setRestApiStopped = function () {
    if (this.restApiRunning) {
        this.restApiRunning = false;

        checkFinalizeShutdown.call(this);
    }
};


// Module functions used to simulate private Application object methods
//  NOTE: these functions need to be bound to a Application object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

function checkInitComplete() {
    return this.ipfsRepoAutomationOn && this.restApiRunning;
}

function checkShutdownComplete() {
    return !this.ipfsRepoAutomationOn && !this.restApiRunning;
}

function startProcessing() {
    CtnOCSvr.logger.TRACE('Application started');
    this.runningState = Application.runningState.started;

    this.runningState = Application.runningState.ready;
    CtnOCSvr.logger.INFO('Application ready');
}

function processShutdown() {
    if (this.runningState !== Application.runningState.stopping) {
        CtnOCSvr.logger.INFO('Application shutting down');
        this.runningState = Application.runningState.stopping;

        if (CtnOCSvr.restApi) {
            // Shutdown Rest API
            CtnOCSvr.restApi.shutdown();

            // Wait for some time to make sure that all processing is finalized gracefully
            //  before turning off IPFS repository automation
            setTimeout(() => {
                // Make sure that code runs in its own fiber
                Future.task(() => {
                    CtnOCSvr.ipfsRepo.turnAutomationOff()
                }).detach();
            }, cfgSettings.shutdownTimeout);
        }
        else if (CtnOCSvr.ipfsRepo) {
            CtnOCSvr.ipfsRepo.turnAutomationOff();
        }

        checkFinalizeShutdown.call(this);
    }
    else {
        CtnOCSvr.logger.DEBUG('Request to shutdown application while application is already stopping; request ignored');
    }
}

function checkFinalizeShutdown() {
    if (checkShutdownComplete.call(this)) {
        finalizeShutdown.call(this);
    }
}

function finalizeShutdown() {
    if (CtnOCSvr.db) {
        try {
            // Close database client
            CtnOCSvr.db.close(true);
        }
        catch (err) {
            CtnOCSvr.logger.ERROR('Error while closing database client.', err);
        }
    }

    CtnOCSvr.logger.INFO('Exiting now');
    process.exit(this.fatalError ? -1 : 0);
}

function shutdownWithError(err) {
    CtnOCSvr.logger.FATAL('Uncaught exception; shutting down application.', err);
    // A fatal error (uncaught exception) has occurred. Try to shutdown gracefully
    //  forcing application to exit after a while
    this.fatalError = true;

    setTimeout(() => {
        process.exit(-2);
    }, cfgSettings.shutdownWithErrorTimeout);

    processShutdown.call(this);
}


// Application function class (public) methods
//

Application.initialize = function () {
    CtnOCSvr.logger.TRACE('Application initialization');
    CtnOCSvr.app = new Application();
};


// Application function class (public) properties
//

Application.runningState = Object.freeze({
    starting: 'starting',
    started: 'started',
    ready: 'ready',
    stopping: 'stopping'
});


// Definition of module (private) functions
//

function envSubdomainPrefix(env) {
    let prefix;

    switch (env) {
        case 'development':
            prefix = 'dev.';
            break;

        case 'sandbox':
            prefix = 'sandbox.';
            break;

        default:
            prefix = '';
            break;
    }

    return prefix;
}


// Module code
//
