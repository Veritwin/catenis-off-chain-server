/**
 * Created by claudio on 2019-11-18
 */

// Module variables
//

// References to external code
//
// Internal node modules
import path from 'path';
import url from 'url';
// Third-party node modules

// References code in other (Catenis Off-Chain Server) modules
import {fixIt as fixMoment} from './FixMoment.js';


// Module code
//

// Fix moment class so the proper string is returned when inspecting moment objects on Node.js >= 12.0.0
fixMoment();

// Set application root directory
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
global.CTN_OC_SVR_ROOT_DIR = path.join(__dirname, '..');

// Set config directory
if (!process.env.NODE_CONFIG_DIR) {
    process.env.NODE_CONFIG_DIR = path.join(global.CTN_OC_SVR_ROOT_DIR, 'config');
}
