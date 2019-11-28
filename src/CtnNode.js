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
import config from 'config';

// References code in other (Catenis Off-Chain Server) modules

// Config entries
const ctnNodeConfig = config.get('ctnNode');

// Configuration settings
const cfgSettings = {
    index: ctnNodeConfig.get('index'),
    idPrefix: ctnNodeConfig.get('idPrefix'),
    privKey: ctnNodeConfig.get('privKey'),
    pubKey: ctnNodeConfig.get('pubKey')
};

export const ctnNode = {
    index: cfgSettings.index,
    id: makeCtnNodeId(cfgSettings.index)
};


// Definition of module (private) functions
//

function makeCtnNodeId(idx) {
    return cfgSettings.idPrefix + idx;
}


// Module code
//

Object.defineProperties(ctnNode, {
    privKey: {
        get: function () {
            return cfgSettings.privKey;
        },
        enumerable: true
    },
    pubKey: {
        get: function () {
            return cfgSettings.pubKey;
        },
        enumerable: true
    }
});
