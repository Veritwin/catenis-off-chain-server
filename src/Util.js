/**
 * Created by claudio on 2019-11-19
 */

// Module variables
//

// References to external code

// Internal node modules
//import util from 'util';
// Third-party node modules
import Future from 'fibers/future';
import dns from "dns";

// References code in other (Catenis Off-Chain Server) modules

// Definition of module (private) functions
//

export function strictParseInt(val) {
    return Number.isInteger(val) ? val : (typeof val === 'string' && /^\d+$/.test(val) ? parseInt(val, 10) : NaN);
}

export const syncDnsResolveTxt = (() => {
    const futFunc = Future.wrap(dns.resolveTxt);

    return function syncDnsResolveTxt() {
        return futFunc.apply(this, arguments).wait();
    }
})();

// Note: this method was gotten from Meteor
export function wrapAsync(fn, context) {
    return function (/* arguments */) {
        const self = context || this;
        const newArgs = Array.prototype.slice.call(arguments);
        let callback;
        let i;

        for (i = newArgs.length - 1; i >= 0; --i) {
            const arg = newArgs[i];
            const type = typeof arg;
            if (type !== "undefined") {
                if (type === "function") {
                    callback = arg;
                }
                break;
            }
        }

        let fut;

        if (! callback) {
            fut = new Future();
            callback = fut.resolver();
            ++i; // Insert the callback just after arg.
        }

        newArgs[i] = callback;
        const result = fn.apply(self, newArgs);
        return fut ? fut.wait() : result;
    };
}

export function formatNumber(n, d) {
    const s = n.toString();

    return s.length >= d ? s : '0'.repeat(d).substring(0, d - s.length) + s;
}
