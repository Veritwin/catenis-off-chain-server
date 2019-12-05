/**
 * Created by claudio on 2019-11-19
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
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

// Module code
//

Future.task(function mainTask() {
    CtnOCSvr.logger.TRACE('Starting application');
    Application.initialize();
    Database.initialize();
    CtnNameService.initialize();
    IpfsClient.initialize();
    IpfsRepo.initialize();
    ClientNotification.initialize();
    RestApi.initialize();
}).detach();
