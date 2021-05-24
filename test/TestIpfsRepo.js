/**
 * Created by claudio on 2019-11-27
 */

import {expect} from 'chai';

import './init/Setup';
import {CtnOCSvr} from '../src/CtnOffChainSvr';
import {Application} from '../src/Application';
import {Database} from '../src/Database';
import {CtnNameService} from '../src/CtnNameService';
import {IpfsClient} from '../src/IpfsClient';
import {IpfsRepo} from '../src/IpfsRepo';
import {ctnNode} from '../src/CtnNode';

describe.skip('IPFS Repository', function (done) {
    let newCid;

    before(async function () {
        this.timeout(10000);
        await (async function () {
            Application.initialize();
            await Database.initialize();
            await CtnNameService.initialize();
            IpfsClient.initialize();
            await IpfsRepo.initialize();
        })();
    });

    after(async function () {
        if (CtnOCSvr.db) {
            await CtnOCSvr.db.close();
        }
    });

    it('should have been properly initialized', function () {
        expect(CtnOCSvr.ipfsRepo).not.to.be.undefined;
    });

    it.skip('should successfully save repo root CID', async function () {
        await CtnOCSvr.ipfsRepo.boundSaveRootCid();
        expect(CtnOCSvr.ipfsRepo.lastSavedRootCid).to.equal(CtnOCSvr.ipfsRepo.rootCid);
    });

    it.skip('should successfully save off-chain message data', async function () {
        const refDate = new Date();
        await CtnOCSvr.ipfsRepo.saveOffChainMsgData(Buffer.from('Simulated off-chain msg envelope #' + refDate.getTime()), IpfsRepo.offChainMsgDataRepo.msgEnvelope, false, refDate);
        console.debug('>>>>>> ipfsRepo:', CtnOCSvr.ipfsRepo);
    });

    it.skip('should correctly scan repo path', async function () {
        const scannedPaths = await CtnOCSvr.ipfsRepo.boundScanRepoPath(IpfsRepo.repoSubtype.offChainMsgData, CtnOCSvr.ipfsRepo.rootCid);
        expect(scannedPaths).to.be.an('array');
        console.debug('>>>>>> scannedPaths:', scannedPaths);
    });

    it.skip('should successfully retrieve off-chain message data', async function () {
        this.timeout(10000);
        await CtnOCSvr.ipfsRepo.boundRetrieveOffChainMsgData({cid: CtnOCSvr.ipfsRepo.rootCid, refDate: new Date()}, ctnNode.index);
        CtnOCSvr.ipfsRepo.savingRootCid = false;
        expect(CtnOCSvr.ipfsRepo.lastSavedRootCid).to.equal(CtnOCSvr.ipfsRepo.rootCid);
    });

    it.skip('should successfully retrieve repo root CID', async function () {
        this.timeout(10000);
        const prevRetrievalDate = await CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate;
        await CtnOCSvr.ipfsRepo.boundRetrieveRootCids();
        expect(CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate).to.not.equal(prevRetrievalDate);
    });

    it.skip('should correctly list retrieved off-chain message data', async function () {
        const result = await CtnOCSvr.ipfsRepo.listRetrievedOffChainMsgData(new Date('2019-11-29T13:30:00Z'));
        console.debug('>>>>>> List result:', result);
    });
});
