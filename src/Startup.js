/**
 * Created by claudio on 2019-11-19
 */

// Module variables
//

// References to external code
//
// Internal node modules
import fs from 'fs';
import path from 'path';
// Third-party node modules
import config from 'config';
import Future from 'fibers/future';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {Application} from './Application';
import {Database} from './Database';
import {CtnNameService} from './CtnNameService';
import {IpfsClient} from './IpfsClient';
import {IpfsRepo} from './IpfsRepo';
import {ClientNotification} from './ClientNotification';
import {RestApi} from './RestApi';

// Config entries
const startupConfig = config.get('startup');

// Configuration settings
const cfgSettings = {
    pidFilename: startupConfig.get('pidFilename')
};


// Definition of module (private) functions
//

function saveProcessId() {
    fs.writeFile(path.join(global.CTN_OC_SVR_ROOT_DIR, cfgSettings.pidFilename), process.pid.toString(), (err) => {
        if (err) {
            // Error recording process ID
            CtnOCSvr.logger.ERROR('Error recording process ID.', err);
        }
    });
}


// Module code
//

Future.task(function mainTask() {
    CtnOCSvr.logger.TRACE('Starting application');
    // Record ID of current process
    saveProcessId();

    Application.initialize();
    Database.initialize();
    CtnNameService.initialize();
    IpfsClient.initialize();
    IpfsRepo.initialize();
    ClientNotification.initialize();
    RestApi.initialize();
}).detach();
