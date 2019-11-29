/**
 * Created by claudio on 2019-11-21
 */

import Future from 'fibers/future';
import {expect} from 'chai';

import './init/Setup';
import {CtnOCSvr} from '../src/CtnOffChainSvr';
import {Application} from '../src/Application';
import {Database} from '../src/Database';
import {IpfsClient} from '../src/IpfsClient';

describe.skip('IPFS Client', function (done) {
    before(function (done) {
        Future.task(function () {
            Application.initialize();
            Database.initialize();
            IpfsClient.initialize();
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
        expect(CtnOCSvr.ipfsClient).not.to.be.undefined;
    });

    it('should successfully call files.stat API method', function (done) {
        Future.task(function () {
            let result;

            expect(function () {
                result = CtnOCSvr.ipfsClient.filesStat('/root', {hash: true});
            }).to.not.throw();
            console.debug('>>>>>> Files stat:', result);
            expect(result).to.be.a('object').that.has.any.keys('hash');
        }).resolve(done);
    });

    it('should throw if stating a non-existent files path', function (done) {
        Future.task(function () {
            let error;

            expect(function () {
                try {
                    CtnOCSvr.ipfsClient.filesStat('/bla', {hash: true});
                }
                catch (err) {
                    error = err;
                    throw err;
                }
            }).to.throw(Error, 'Error calling IPFS API \'filesStat\' method.');
            expect(error._ipfsError).to.be.a('Error');
            console.debug('>>>>>> IPFS error:', error._ipfsError.message);
        }).resolve(done);
    });

    it('should successfully write file', function (done) {
        Future.task(function () {
            let error;

            expect(function () {
                try {
                    CtnOCSvr.ipfsClient.filesWrite('/root/testfile001', Buffer.from('Only a test'), {create: false});
                }
                catch (err) {
                    error = err;
                    throw err;
                }
            }).to.throw(Error, 'Error calling IPFS API \'filesWrite\' method.');
            expect(error._ipfsError).to.be.a('Error');
            console.debug('>>>>>> IPFS error:', error._ipfsError.message);
        }).resolve(done);
    });
});
