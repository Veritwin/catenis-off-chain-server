/**
 * Created by claudio on 2019-11-21
 */

import stream from 'stream';
import chai from 'chai';
const {expect} = chai;
import ihc from 'ipfs-http-client';
const {CID} = ihc;
import {IpfsClient} from '../src/IpfsClient.js';

describe('IPFS Client', function (done) {
    let ipfsClient;
    
    before(async function () {
        ipfsClient = new IpfsClient('catenis-local-1.shared', 9095, 'http');
    });

    const tstMsg1 = {
        data: Buffer.from('Test message #1')
    };
    const tstMsg2 = {
        data: Buffer.from('Test message #2')
    };
    let mfsRoot;

    it('should successfully retrieve IPFS node info', async function () {
        const result = await ipfsClient.id();

        //console.debug('>>>>>> ipfsClient.id() result:', result);
        expect(result).to.be.a('object').that.include.keys('id', 'publicKey', 'addresses', 'agentVersion', 'protocolVersion');
    });

    it('should successfully add content to IPFS', async function () {
        const result = await ipfsClient.add(tstMsg1.data);

        //console.debug('>>>>>> ipfsClient.add() result:', result);
        expect(result).to.be.a('object').that.include.keys('path', 'cid', 'size');
        expect(result.cid).to.be.an.instanceOf(CID);
        // Save returned CID
        tstMsg1.cid = result.cid;
    });

    it('should successfully retrieve the saved content', async function () {
        const result = await ipfsClient.cat(tstMsg1.cid);

        //console.debug('>>>>>> ipfsClient.cat() result:', result);
        expect(Buffer.isBuffer(result)).to.true;
        expect(result.compare(tstMsg1.data)).equals(0);
    });

    it('should throw if trying to retrieve an invalid content', async function () {
        let error;

        try {
            await ipfsClient.cat(tstMsg1.cid.toString() + '/bla');
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.an('error').with.property('message')
        .that.include('Error calling IPFS API \'cat\' method: no link named "bla"');
    });

    it('should successfully retrieve the saved content (via a stream)', function (done) {
        const readStr = ipfsClient.catReadableStream(tstMsg1.cid);

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
    });

    it('should successfully stat MFS root dir', async function () {
        const result = await ipfsClient.filesStat('/');

        //console.debug('>>>>>> ipfsClient.filesStat() result:', result);
        expect(result).to.be.a('object').that.include.keys('cid', 'size', 'cumulativeSize', 'type', 'blocks');
        // Save MSF root dir info
        mfsRoot = result;
    });

    it('should successfully list contents of MFS root dir (not via MFS)', async function () {
        const result = await ipfsClient.ls(mfsRoot.cid);

        //console.debug('>>>>>> ipfsClient.ls() result:', result);
        expect(result).to.be.a('array').that.has.lengthOf(1);
        expect(result[0]).to.be.a('object').that.include.keys('depth', 'name', 'path', 'size', 'cid', 'type');
    });

    it('should successfully create a new directory on MFS', async function () {
        let error;

        try {
            await ipfsClient.filesMkdir('/ipfsClientTest');
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
    });

    it('should successfully copy content to on MFS directory', async function () {
        let error;

        try {
            await ipfsClient.filesCp(tstMsg1.cid, '/ipfsClientTest/tstMsg1');
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
    });

    it('should successfully write file to MFS directory', async function () {
        let error;

        try {
            await ipfsClient.filesWrite('/ipfsClientTest/tstMsg2', tstMsg2.data, {create: true});
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
    });

    it('should successfully list contents of MFS directory', async function () {
        const result = await ipfsClient.filesLs('/ipfsClientTest');

        //console.debug('>>>>>> ipfsClient.filesLs() result:', result);
        expect(result).to.be.a('array').that.has.lengthOf(2);
        expect(result[0]).to.be.a('object').that.include.keys('name', 'type', 'size', 'cid');
        expect(result[0].name).to.equals('tstMsg1');
        expect(result[1].name).to.equals('tstMsg2');
        // Save CID of second test message
        tstMsg2.cid = result[1].cid;
    });

    it('should successfully removed a MFS directory', async function () {
        let error;

        try {
            await ipfsClient.filesRm('/ipfsClientTest', {recursive: true});
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.undefined;
    });

    it('should successfully pin a content', async function () {
        const result = await ipfsClient.pinAdd(tstMsg1.cid.toString());

        //console.debug('>>>>>> ipfsClient.pinAdd() result:', result);
        expect(result).to.deep.equal(tstMsg1.cid);
    });

    it('should successfully list the pinned content', async function () {
        const result = await ipfsClient.pinLs({paths: tstMsg1.cid});

        //console.debug('>>>>>> ipfsClient.pinLs() result:', result);
        expect(result).to.be.a('array').that.has.lengthOf(1);
        expect(result[0]).to.be.a('object').that.has.keys('cid', 'type');
        expect(result[0].cid.toString()).to.equal(tstMsg1.cid.toString());
    });

    it('should successfully replace a pinned content', async function () {
        const result = await ipfsClient.pinUpdate(tstMsg1.cid.toString(), tstMsg2.cid.toString(), {unpin: true});

        //console.debug('>>>>>> ipfsClient.pinUpdate() result:', result);
        expect(result).to.be.a('array').that.has.lengthOf(2);
        expect(result[0]).to.be.a('object').that.has.keys('cid');
        expect(result[0].cid.toString()).to.equal(tstMsg1.cid.toString());
        expect(result[1]).to.be.a('object').that.has.keys('cid');
        expect(result[1].cid.toString()).to.equal(tstMsg2.cid.toString());
    });

    it('should fail to removed first pinned content', async function () {
        let error;

        try {
            await ipfsClient.pinRm(tstMsg1.cid.toString());
        }
        catch (err) {
            error = err;
        }

        expect(error).to.be.an('error').with.property('message')
        .that.include('Error calling IPFS API \'pinRm\' method: pin is not part of the pinset');
    });

    it('should successfully list second pinned content', async function () {
        const result = await ipfsClient.pinLs({paths: tstMsg2.cid});

        //console.debug('>>>>>> ipfsClient.pinLs() result (2):', result);
        expect(result).to.be.a('array').that.has.lengthOf(1);
        expect(result[0]).to.be.a('object').that.has.keys('cid', 'type');
        expect(result[0].cid.toString()).to.equal(tstMsg2.cid.toString());
    });

    it('should successfully remove second pinned content', async function () {
        const result = await ipfsClient.pinRm(tstMsg2.cid.toString());

        //console.debug('>>>>>> ipfsClient.pinRm() result:', result);
        expect(result).to.deep.equal(tstMsg2.cid);
    });
});
