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

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';
import {Application} from './Application.js';
import {Database} from './Database.js';
import {CtnNameService} from './CtnNameService.js';
import {IpfsClient} from './IpfsClient.js';
import {IpfsRepo} from './IpfsRepo.js';
import {ClientNotification} from './ClientNotification.js';
import {RestApi} from './RestApi.js';

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

(async function mainTask() {
    CtnOCSvr.logger.TRACE('Starting application');
    // Record ID of current process
    saveProcessId();

    Application.initialize();
    await Database.initialize();
    await CtnNameService.initialize();
    IpfsClient.initialize();
    await IpfsRepo.initialize();
    ClientNotification.initialize();
    RestApi.initialize();
})();
