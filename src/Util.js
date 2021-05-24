/**
 * Created by claudio on 2019-11-19
 */

// Module variables
//

// References to external code

// Internal node modules
//import util from 'util';
// Third-party node modules
import dns from "dns";

// References code in other (Catenis Off-Chain Server) modules

// Definition of module (private) functions
//

export function strictParseInt(val) {
    return Number.isInteger(val) ? val : (typeof val === 'string' && /^\d+$/.test(val) ? parseInt(val, 10) : NaN);
}

export function callbackToPromise(func, context) {
    return function (...args) {
        let callback;
        const result = new Promise((resolve, reject) => {
            callback = (err, ...res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res.length === 1 ? res[0] : res);
                }
            }
        });

        args.push(callback);
        func.apply(context, args);

        return result;
    };
}

export const promDnsResolveTxt = callbackToPromise(dns.resolveTxt);

export async function asyncIterableToArray(it) {
    const arr = [];

    for await (let el of it) {
        arr.push(el);
    }

    return arr;
}

export async function asyncIterableToBuffer(it) {
    return Buffer.concat(await asyncIterableToArray(it));
}

export function formatNumber(n, d) {
    const s = n.toString();

    return s.length >= d ? s : '0'.repeat(d).substring(0, d - s.length) + s;
}
