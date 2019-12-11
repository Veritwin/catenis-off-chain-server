/**
 * Created by claudio on 2019-11-27
 */

import Future from 'fibers/future';
import {expect} from 'chai';

import './init/Setup';
import {CtnOCSvr} from '../src/CtnOffChainSvr';
import {Application} from '../src/Application';
import {Database} from '../src/Database';
import {CtnNameService} from '../src/CtnNameService';
import {IpfsClient} from '../src/IpfsClient';
import {IpfsRepo} from '../src/IpfsRepo';
import {ctnNode} from '../src/CtnNode';

describe.only('IPFS Repository', function (done) {
    let newCid;

    before(function (done) {
        this.timeout(10000);
        Future.task(function () {
            Application.initialize();
            Database.initialize();
            CtnNameService.initialize();
            IpfsClient.initialize();
            IpfsRepo.initialize();
        }).resolve(done);
    });

    after(function (done) {
        Future.task(function () {
            if (CtnOCSvr.db) {
                CtnOCSvr.db.close();
            }
        }).resolve(done);
    });

    it('should have been properly initialized', function () {
        expect(CtnOCSvr.ipfsRepo).not.to.be.undefined;
    });

    it.skip('should successfully save repo root CID', function (done) {
        let doneCalled = false;
        function callDone(err) {
            if (!doneCalled) {
                doneCalled = true;
                done(err);
            }
        }

        Future.task(function () {
            CtnOCSvr.ipfsRepo.boundSaveRootCid(function (err) {
                console.debug('>>>>>> Inner method finished');
                if (err) {
                    callDone(err);
                }
                else {
                    expect(CtnOCSvr.ipfsRepo.lastSavedRootCid).to.equal(CtnOCSvr.ipfsRepo.rootCid);
                    callDone();
                }
            });
        }).resolve(function (err) {
            console.debug('>>>>>> Future task returned');
            if (err) {
                callDone(err);
            }
        });
    });

    it.skip('should successfully save off-chain message data', function (done) {
        Future.task(function () {
            CtnOCSvr.ipfsRepo.saveOffChainMsgData(Buffer.from('Simulated off-chain msg receipt #20'), IpfsRepo.offChainMsgDataRepo.msgEnvelope, '2019-11-22T15:25:11.283Z');
            console.debug('>>>>>> ipfsRepo:', CtnOCSvr.ipfsRepo);
        }).resolve(done);
    });

    it.skip('should correctly scan repo path', function (done) {
        Future.task(function () {
            const scannedPaths = CtnOCSvr.ipfsRepo.boundScanRepoPath(IpfsRepo.repoSubtype.offChainMsgData, CtnOCSvr.ipfsRepo.rootCid);
            expect(scannedPaths).to.be.an('array');
            console.debug('>>>>>> scannedPaths:', scannedPaths);
        }).resolve(done);
    });

    it.skip('should successfully retrieve off-chain message data', function (done) {
        this.timeout(10000);
        let doneCalled = false;
        function callDone(err) {
            if (!doneCalled) {
                doneCalled = true;
                done(err);
            }
        }

        Future.task(function () {
            CtnOCSvr.ipfsRepo.boundRetrieveOffChainMsgData({cid: CtnOCSvr.ipfsRepo.rootCid, refDate: new Date()}, ctnNode.index, function (err) {
                console.debug('>>>>>> Inner method finished');
                CtnOCSvr.ipfsRepo.savingRootCid = false;

                if (err) {
                    callDone(err);
                }
                else {
                    expect(CtnOCSvr.ipfsRepo.lastSavedRootCid).to.equal(CtnOCSvr.ipfsRepo.rootCid);
                    callDone();
                }
            });
        }).resolve(function (err) {
            console.debug('>>>>>> Future task returned');
            if (err) {
                callDone(err);
            }
        });
    });

    it.skip('should successfully retrieve repo root CID', function (done) {
        this.timeout(10000);
        let doneCalled = false;
        function callDone(err) {
            if (!doneCalled) {
                doneCalled = true;
                done(err);
            }
        }

        Future.task(function () {
            const prevRetrievalDate = CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate;

            CtnOCSvr.ipfsRepo.boundRetrieveRootCids(function (err) {
                console.debug('>>>>>> Inner method finished');
                if (err) {
                    callDone(err);
                }
                else {
                    expect(CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate).to.not.equal(prevRetrievalDate);
                    callDone();
                }
            });
        }).resolve(function (err) {
            console.debug('>>>>>> Future task returned');
            if (err) {
                callDone(err);
            }
        });
    });

    it.skip('should correctly list retrieved off-chain message data', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsRepo.listRetrievedOffChainMsgData(new Date('2019-11-29T13:30:00Z'));
            console.debug('>>>>>> List result:', result);
        }).resolve(done);
    });
});
