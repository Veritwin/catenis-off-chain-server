/**
 * Created by claudio on 2019-11-20
 */

import Future from 'fibers/future';
import {expect} from 'chai';

import './init/Setup';
import {CtnOCSvr} from '../src/CtnOffChainSvr';
import {Application} from '../src/Application';
import {Database} from '../src/Database';
import {CtnNameService} from '../src/CtnNameService';

describe('Catenis Name Service', function (done) {
    let newCid;

    before(function (done) {
        Future.task(function () {
            Application.initialize();
            Database.initialize();
            CtnNameService.initialize();
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
        expect(CtnOCSvr.cns).not.to.be.undefined;
    });

    it('should successfully retrieve IPFS repository root CID', function (done) {
        Future.task(function () {
            let data;

            expect(function () {
                data = CtnOCSvr.cns.getIpfsRepoRootCid();
            }).to.not.throw();
            expect(data === undefined || typeof data === 'object').to.be.true;

            if (data) {
                expect(data).to.have.all.keys('cid', 'lastUpdatedDate');
                expect(data.cid).to.be.a('string');
            }
        }).resolve(done);
    });

    it('should successfully set IPFS repository root CID', function (done) {
        Future.task(function () {
            newCid = 'Test_newCID#' + Date.now();

            expect(function () {
                CtnOCSvr.cns.setIpfsRepoRootCid(newCid);
            }).to.not.throw();
        }).resolve(done);
    });

    it('should successfully retrieve new IPFS repository root CID', function (done) {
        Future.task(function () {
            let data;

            expect(function () {
                data = CtnOCSvr.cns.getIpfsRepoRootCid();
            }).to.not.throw();
            expect(data === undefined || typeof data === 'object').to.be.true;

            if (data) {
                expect(data).to.have.all.keys('cid', 'lastUpdatedDate');
                expect(data.cid).to.equal(newCid);
            }
        }).resolve(done);
    });

    it('should successfully retrieve all IPFS repository root CIDs', function (done) {
        Future.task(function () {
            let data;

            expect(function () {
                data = CtnOCSvr.cns.getAllIpfsRepoRootCids();
            }).to.not.throw();
            expect(data === undefined || typeof data === 'object').to.be.true;

            if (data) {
                Object.values(data).forEach(function (entry) {
                    expect(entry).to.have.all.keys('cid', 'lastUpdatedDate');
                });
            }
        }).resolve(done);
    });
});
