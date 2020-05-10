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

export function wrapAsyncPromise(fn, context) {
    return function (/* arguments */) {
        return Future.fromPromise(fn.apply(context || this, Array.from(arguments))).wait();
    };
}

export function wrapAsyncIterable(fn, sink, context) {
    return function (/* arguments */) {
        return sink(fn.apply(context || this, Array.from(arguments)));
    };
}

// Note: this should be used as a `sink` to Util.wrapAsyncIterable()
export function asyncIterableToArray(it) {
    const arr = [];
    const fut = new Future();

    (async function () {
        for await (let el of it) {
            arr.push(el);
        }

        fut.return(arr);
    })()
    .catch((err) => {
        if (!fut.isResolved()) {
            fut.throw(err);
        }
    });

    fut.wait();

    return arr;
}

// Note: this should be used as a `sink` to Util.wrapAsyncIterable()
export function asyncIterableToBuffer(it) {
    return Buffer.concat(asyncIterableToArray(it));
}

export function formatNumber(n, d) {
    const s = n.toString();

    return s.length >= d ? s : '0'.repeat(d).substring(0, d - s.length) + s;
}
