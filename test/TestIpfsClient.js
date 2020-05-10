/**
 * Created by claudio on 2019-11-21
 */

import stream from 'stream';
import Future from 'fibers/future';
import {expect} from 'chai';
import {CID} from 'ipfs-http-client';

import './init/Setup';
import {CtnOCSvr} from '../src/CtnOffChainSvr';
import {Application} from '../src/Application';
import {Database} from '../src/Database';
import {IpfsClient} from '../src/IpfsClient';

describe('IPFS Client', function (done) {
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

    const tstMsg1 = {
        data: Buffer.from('Test message #1')
    };
    const tstMsg2 = {
        data: Buffer.from('Test message #2')
    };
    let mfsRoot;

    it('should have been properly initialized', function () {
        expect(CtnOCSvr.ipfsClient).not.to.be.undefined;
    });

    it('should successfully retrieve IPFS node info', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.id();

            //console.debug('>>>>>> ipfsClient.id() result:', result);
            expect(result).to.be.a('object').that.include.keys('id', 'publicKey', 'addresses', 'agentVersion', 'protocolVersion');
        }).resolve(done);
    });

    it('should successfully add content to IPFS', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.add(tstMsg1.data);

            //console.debug('>>>>>> ipfsClient.add() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.include.keys('path', 'cid', 'size');
            expect(result[0].cid).to.be.an.instanceOf(CID);
            // Save returned CID
            tstMsg1.cid = result[0].cid;
        }).resolve(done);
    });

    it('should successfully retrieve the saved content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.cat(tstMsg1.cid);

            //console.debug('>>>>>> ipfsClient.cat() result:', result);
            expect(Buffer.isBuffer(result)).to.true;
            expect(result.compare(tstMsg1.data)).equals(0);
        }).resolve(done);
    });

    it('should successfully retrieve the saved content (via a stream)', function (done) {
        Future.task(function () {
            const readStr = CtnOCSvr.ipfsClient.catReadableStream(tstMsg1.cid);

            expect(readStr).to.be.an.instanceOf(stream.Readable);

            // Read content
            const dataChunks = [];

            readStr.on('data', chunk => dataChunks.push(chunk));
            readStr.on('end', () => {
                const readContent = Buffer.concat(dataChunks);
                expect(readContent.compare(tstMsg1.data)).equals(0);
                done();
            });
            readStr.on('error', err => done(err));
        }).detach();
    });

    it('should successfully stat MFS root dir', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.filesStat('/');

            //console.debug('>>>>>> ipfsClient.filesStat() result:', result);
            expect(result).to.be.a('object').that.include.keys('cid', 'size', 'cumulativeSize', 'type', 'blocks');
            // Save MSF root dir info
            mfsRoot = result;
        }).resolve(done);
    });

    it('should successfully list contents of MFS root dir (not via MFS)', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.ls(mfsRoot.cid);

            //console.debug('>>>>>> ipfsClient.ls() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.include.keys('depth', 'name', 'path', 'size', 'cid', 'type');
        }).resolve(done);
    });

    it('should successfully create a new directory on MFS', function (done) {
        Future.task(function () {
            expect(function () {
                CtnOCSvr.ipfsClient.filesMkdir('/ipfsClientTest');
            }).not.to.throw();
        }).resolve(done);
    });

    it('should successfully copy content to on MFS directory', function (done) {
        Future.task(function () {
            expect(function () {
                CtnOCSvr.ipfsClient.filesCp(tstMsg1.cid, '/ipfsClientTest/tstMsg1');
            }).not.to.throw();
        }).resolve(done);
    });

    it('should successfully write file to MFS directory', function (done) {
        Future.task(function () {
            expect(function () {
                CtnOCSvr.ipfsClient.filesWrite('/ipfsClientTest/tstMsg2', tstMsg2.data, {create: true});
            }).not.to.throw();
        }).resolve(done);
    });

    it('should successfully list contents of MFS directory', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.filesLs('/ipfsClientTest');

            //console.debug('>>>>>> ipfsClient.filesLs() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(2);
            expect(result[0]).to.be.a('object').that.include.keys('name', 'type', 'size', 'cid');
            expect(result[0].name).to.equals('tstMsg1');
            expect(result[1].name).to.equals('tstMsg2');
            // Save CID of second test message
            tstMsg2.cid = result[1].cid;
        }).resolve(done);
    });

    it('should successfully removed a MFS directory', function (done) {
        Future.task(function () {
            expect(function () {
                CtnOCSvr.ipfsClient.filesRm('/ipfsClientTest', {recursive: true});
            }).not.to.throw();
        }).resolve(done);
    });

    it('should successfully pin a content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.pinAdd(tstMsg1.cid.toString());

            //console.debug('>>>>>> ipfsClient.pinAdd() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.has.keys('cid');
        }).resolve(done);
    });

    it('should successfully list the pinned content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.pinLs(tstMsg1.cid);

            //console.debug('>>>>>> ipfsClient.pinLs() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.has.keys('cid', 'type');
            expect(result[0].cid.toString()).to.equal(tstMsg1.cid.toString());
        }).resolve(done);
    });

    it('should successfully replace a pinned content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.pinUpdate(tstMsg1.cid.toString(), tstMsg2.cid.toString(), {unpin: true});

            //console.debug('>>>>>> ipfsClient.pinUpdate() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(2);
            expect(result[0]).to.be.a('object').that.has.keys('cid');
            expect(result[0].cid.toString()).to.equal(tstMsg1.cid.toString());
            expect(result[1]).to.be.a('object').that.has.keys('cid');
            expect(result[1].cid.toString()).to.equal(tstMsg2.cid.toString());
        }).resolve(done);
    });

    it('should fail to removed first pinned content', function (done) {
        Future.task(function () {
            expect(function () {
                CtnOCSvr.ipfsClient.pinRm(tstMsg1.cid.toString());
            }).to.throw(Error, 'Error calling IPFS API \'pinRm\' method: pin is not part of the pinset')
        }).resolve(done);
    });

    it('should successfully list second pinned content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.pinLs(tstMsg2.cid);

            //console.debug('>>>>>> ipfsClient.pinLs() result (2):', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.has.keys('cid', 'type');
            expect(result[0].cid.toString()).to.equal(tstMsg2.cid.toString());
        }).resolve(done);
    });

    it('should successfully removed second pinned content', function (done) {
        Future.task(function () {
            const result = CtnOCSvr.ipfsClient.pinRm(tstMsg2.cid.toString());

            //console.debug('>>>>>> ipfsClient.pinRm() result:', result);
            expect(result).to.be.a('array').that.has.lengthOf(1);
            expect(result[0]).to.be.a('object').that.has.keys('cid');
        }).resolve(done);
    });
});
