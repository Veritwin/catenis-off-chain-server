/**
 * Created by claudio on 2019-11-20
 */

import chai from 'chai';
const {expect} = chai;

import './init/Setup.js';
import {CtnOCSvr} from '../src/CtnOffChainSvr.js';
import {Application} from '../src/Application.js';
import {Database} from '../src/Database.js';
import {CtnNameService} from '../src/CtnNameService.js';

describe.skip('Catenis Name Service', function (done) {
    let newCid;

    before(async function () {
        this.timeout(10000);
        await (async function () {
            Application.initialize();
            await Database.initialize();
            await CtnNameService.initialize();
        })();
    });

    after(async function () {
        if (CtnOCSvr.db) {
            await CtnOCSvr.db.close();
        }
    });

    it('should have been properly initialized', function () {
        expect(CtnOCSvr.cns).not.to.be.undefined;
    });

    it('should successfully retrieve IPFS repository root CID', async function () {
        let data;
        let error;

        try {
            data = await CtnOCSvr.cns.getIpfsRepoRootCid();
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
        expect(data === undefined || typeof data === 'object').to.be.true;

        if (data) {
            expect(data).to.have.all.keys('cid', 'lastUpdatedDate');
            expect(data.cid).to.be.a('string');
        }
    });

    it('should successfully set IPFS repository root CID', async function () {
        newCid = 'Test_newCID#' + Date.now();
        let error;

        try {
            await CtnOCSvr.cns.setIpfsRepoRootCid(newCid);
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
    });

    it('should successfully retrieve new IPFS repository root CID', async function () {
        let data;
        let error;

        try {
            data = await CtnOCSvr.cns.getIpfsRepoRootCid();
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
        expect(data === undefined || typeof data === 'object').to.be.true;

        if (data) {
            expect(data).to.have.all.keys('cid', 'lastUpdatedDate');
            expect(data.cid).to.equal(newCid);
        }
    });

    it('should successfully retrieve all IPFS repository root CIDs', async function () {
        let data;
        let error;

        try {
            data = await CtnOCSvr.cns.getAllIpfsRepoRootCids();
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
        expect(data === undefined || typeof data === 'object').to.be.true;

        if (data) {
            Object.values(data).forEach(function (entry) {
                expect(entry).to.have.all.keys('cid', 'lastUpdatedDate');
            });
        }
    });
});
