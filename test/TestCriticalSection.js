/**
 * Created by claudio on 2021-05-20
 */

import {expect} from 'chai';
import {CriticalSection} from '../src/CriticalSection';

describe('Critical Section', function (done) {
    let cs;

    before(async function () {
        // Instantiate critical section
        cs = new CriticalSection();
    });

    // Simulate async processing
    async function doAsyncProcessing(records, label = '0', count = 1) {
        for (let idx = 0; idx < count; idx++) {
            await new Promise(resolve => {
                setTimeout(() => {
                    resolve();
                }, 100);
            });

            records.push(label);
        }
    }

    it('should interweave processing if not using critical section', async function () {
        const records = [];

        // Schedule async processing to take place in the future
        setTimeout(async () => {
            await doAsyncProcessing(records);
        }, 300);

        // Start sync processing now
        await doAsyncProcessing(records, '1', 10);

        const futureExecIdx = records.findIndex(record => record === '0');

        expect(futureExecIdx >= 0 && futureExecIdx < records.length - 1).to.be.true;
    });

    it('should chain processing when using critical section', async function () {
        const records = [];

        // Schedule async processing to take place in the future
        let futureExec;

        setTimeout(async () => {
            futureExec = cs.execute(async () => {
                await doAsyncProcessing(records);
            });
        }, 300);

        // Start sync processing now within critical section
        await cs.execute(async () => {
            await doAsyncProcessing(records, '1', 10);
        });

        if (futureExec) {
            await futureExec;
        }

        const futureExecIdx = records.findIndex(record => record === '0');

        expect(futureExecIdx === records.length - 1).to.be.true;
    });
});
