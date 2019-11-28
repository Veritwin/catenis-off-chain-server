/**
 * Created by claudio on 2019-11-18
 */

import util from 'util';
import moment from 'moment';

export function fixIt() {
    if (!moment.prototype[util.inspect.custom] && moment.prototype.inspect) {
        moment.prototype[util.inspect.custom] = moment.prototype.inspect;
    }
}
