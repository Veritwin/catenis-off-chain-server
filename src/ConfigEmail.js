/**
 * Created by claudio on 2019-11-18
 */

// Module variables
//

// References to external code
//
// Internal node modules
// Third-party node modules
import config from 'config';

// References code in other (Catenis Off-Chain Server) modules

// Config entries
const emailConfig = config.get('email');

// Configuration settings
export const cfgSettings = {
    smtpHost: emailConfig.get('smtpHost'),
    secureProto: emailConfig.has('secureProto') ? emailConfig.get('secureProto') : undefined,
    smtpPort: emailConfig.has('smtpPort') ? emailConfig.get('smtpPort') : undefined,
    username: emailConfig.has('username') ? emailConfig.get('username') : undefined,
    password: emailConfig.has('password') ? emailConfig.get('password') : undefined
};


// Module code
//
