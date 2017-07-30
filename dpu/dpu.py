import unittest as ut
import os, time, base64, re, json, sys, getopt
from pyndn import Name, Data, Face, Interest, Link, MetaInfo
from pyndn.util import Blob, MemoryContentCache
from pyndn.encrypt import Schedule, Consumer, Sqlite3ConsumerDb, EncryptedContent

from pyndn.security import KeyType, KeyChain, RsaKeyParams, SecurityException
from pyndn.security.certificate import IdentityCertificate
from pyndn.security.identity import IdentityManager
from pyndn.security.identity import BasicIdentityStorage, FilePrivateKeyStorage, MemoryIdentityStorage, MemoryPrivateKeyStorage
from pyndn.security.policy import NoVerifyPolicyManager

from dpu_dvu.repo_command import repo_command_parameter_pb2
from dpu_dvu.repo_command import repo_command_response_pb2
from pyndn.encoding import ProtobufTlv

class DPU(object):
    def __init__(self, face, encryptResult, defaultPrefix, link = None):
        # Set up face
        self.face = face
        self._encryptResult = encryptResult
        self._link = link

        self.databaseFilePath = "dpu.db"
        try:
            os.remove(self.databaseFilePath)
        except OSError:
            # no such file
            pass

        self.groupName = Name(defaultPrefix)

        # Set up the keyChain.
        identityStorage = BasicIdentityStorage()
        privateKeyStorage = FilePrivateKeyStorage()
        self.keyChain = KeyChain(
          IdentityManager(identityStorage, privateKeyStorage),
          NoVerifyPolicyManager())

        # Authorized identity
        identityName = Name("/org/openmhealth/dpu")
        # Function name: the function that this DPU provides
        self._functionName = "bounding_box"
        self._identityName = identityName
        
        self.certificateName = self.keyChain.createIdentityAndCertificate(identityName)
        # TODO: if using BasicIdentityStorage and FilePrivateKeyStorage
        #   For some reason this newly generated cert is not installed by default, calling keyChain sign later would result in error
        #self.keyChain.installIdentityCertificate()
        
        self.memoryContentCache = MemoryContentCache(self.face)

        try:
            commandSigningKeyChain = KeyChain()
            print "Default certificate name is: " + commandSigningKeyChain.getDefaultCertificateName().toUri()
            self.face.setCommandSigningInfo(commandSigningKeyChain, commandSigningKeyChain.getDefaultCertificateName())
            self.memoryContentCache.registerPrefix(identityName, self.onRegisterFailed, self.onDataNotFound)
        except SecurityException as e:
            print str(e)
            print "Cannot use default certificate, use created certificate in FilePrivateKeyStorage"
            self.face.setCommandSigningInfo(self.keyChain, self.certificateName)
            self.memoryContentCache.registerPrefix(identityName, self.onRegisterFailed, self.onDataNotFound)

        consumerKeyName = IdentityCertificate.certificateNameToPublicKeyName(self.certificateName)
        consumerCertificate = identityStorage.getCertificate(self.certificateName)
        self.consumer = Consumer(
          face, self.keyChain, self.groupName, identityName,
          Sqlite3ConsumerDb(self.databaseFilePath))

        # TODO: Read the private key to decrypt d-key...this may or may not be ideal
        base64Content = None
        with open(privateKeyStorage.nameTransform(consumerKeyName.toUri(), ".pri")) as keyFile:
            print privateKeyStorage.nameTransform(consumerKeyName.toUri(), ".pri")
            base64Content = keyFile.read()
            print base64Content
        der = Blob(base64.b64decode(base64Content), False)
        self.consumer.addDecryptionKey(consumerKeyName, der)
        print consumerKeyName
        self.memoryContentCache.add(consumerCertificate)

        # request access to user's data, this maybe needed later, but not now
        '''
        accessRequestInterest = Interest(Name(self.groupName).append("read_access_request").append(self.certificateName).appendVersion(int(time.time())))
        self.face.expressInterest(accessRequestInterest, self.onAccessRequestData, self.onAccessRequestTimeout)
        print "Access request interest name: " + accessRequestInterest.getName().toUri()
        '''

        self._tasks = dict()

        return

    # request access to user's data, this maybe needed later, but not now
    '''
    def onAccessRequestData(self, interest, data):
        print "Access request data: " + data.getName().toUri()
        return

    def onAccessRequestTimeout(self, interest):
        print "Access request times out: " + interest.getName().toUri()
        print "Assuming certificate sent and D-key generated"
        return
    '''

    def startConsuming(self, userId, basetimeString, producedDataName, dataNum, outerDataName):
        contentName = Name(userId).append(Name("/SAMPLE/fitness/physical_activity/time_location/"))
        baseZFill = 2

        for i in range(0, dataNum):
            timeString = basetimeString + str(i).zfill(baseZFill) + "00"
            timeFloat = Schedule.fromIsoString(timeString)

            self.consume(Name(contentName).append(timeString), producedDataName, outerDataName)
            print "Trying to consume: " + Name(contentName).append(timeString).toUri()

    def onDataNotFound(self, prefix, interest, face, interestFilterId, filter):
        print "Data not found for interest: " + interest.getName().toUri()
        functionComponentIdx = len(self._identityName)
        if interest.getName().get(functionComponentIdx).toEscapedString() == self._functionName:
            try:
                parameters = interest.getName().get(functionComponentIdx + 1).toEscapedString()
                pattern = re.compile('([^,]*),([^,]*),([^,]*)')
                matching = pattern.match(str(Name.fromEscapedString(parameters)))
                
                userId = matching.group(1)
                basetimeString = matching.group(2)
                producedDataName = matching.group(3)
                dataNum = 60
                self._tasks[producedDataName] = {"cap_num": dataNum, "current_num": 0, "dataset": []}
                #print str(userId),basetimeString,producedDataName,dataNum,interest.getName().toUri()
                self.startConsuming(userId, basetimeString, producedDataName, dataNum, interest.getName().toUri())
            except Exception as e:
                print "Exception in processing function arguments: " + str(e)
        else:
            print "function name mismatch: expected " + self._functionName + " ; got " + interest.getName().get(functionComponentIdx).toEscapedString()
        return

    def onRegisterFailed(self, prefix):
        print "Prefix registration failed: " + prefix.toUri()
        return

    def consume(self, contentName, producedDataName, outerDataName):
        self.consumer.consume(contentName, lambda data, result: self.onConsumeEncryptedComplete(data, result, producedDataName, outerDataName), lambda code, message: self.onConsumeFailed(code, message, producedDataName, outerDataName))
        # the following code is used for testing popurse, testing fetching unencrypted data
        '''
        self.face.expressInterest(contentName, lambda interest, data: self.onConsumeUnencryptedComplete(interest, data, producedDataName, outerDataName), lambda interest: self.onConsumeTiemout(interest, producedDataName, outerDataName));
        '''

    def onConsumeUnEncryptedComplete(self, interest, data, producedDataName, outerDataName):
        print "Consume complete for data name: " + data.getName().toUri()

        if producedDataName in self._tasks:
            self._tasks[producedDataName]["current_num"] += 1
            self._tasks[producedDataName]["dataset"].append(data.getContent())
            if self._tasks[producedDataName]["current_num"] == self._tasks[producedDataName]["cap_num"]:
                self.produceResult(producedDataName, outerDataName)

    def onConsumeEncryptedComplete(self, data, result, producedDataName, outerDataName):
        print "Consume complete for data name: " + data.getName().toUri()
    
        if producedDataName in self._tasks:
            self._tasks[producedDataName]["current_num"] += 1
            self._tasks[producedDataName]["dataset"].append(result)
            if self._tasks[producedDataName]["current_num"] == self._tasks[producedDataName]["cap_num"]:
                self.produceResult(producedDataName, outerDataName)

    def produceResult(self, producedDataName, outerDataName):
        maxLng = -1000
        minLng = 1000
        maxLat = -1000
        minLat = 1000
        for item in self._tasks[producedDataName]["dataset"]:
            dataObject = json.loads(str(item))
            for positionList in dataObject:
#                print positionList
                if positionList["lat"] > maxLat:
                    maxLat = positionList["lat"]
                if positionList["lat"] < minLat:
                    minLat = positionList["lat"]
                if positionList["lng"] > maxLng:
                    maxLng = positionList["lng"]
                if positionList["lng"] < minLng:
                    minLng = positionList["lng"]
            
        if not self._encryptResult:
            innerData = Data(Name(str(producedDataName)))
            innerData.setContent(json.dumps({"minLat": minLat, "maxLat": maxLat, "minLng": minLng, "maxLng": maxLng}))
            self.keyChain.sign(innerData)
                    
            outerData = Data(Name(str(outerDataName)))
            outerData.setContent(innerData.wireEncode())
#            metaInfo = MetaInfo()
#            metaInfo.setFreshnessPeriod(1)
#            outerData.setMetaInfo(metaInfo)
            self.keyChain.sign(outerData)
            
            print "generate final result"
            print outerData.getName()
            self.memoryContentCache.add(outerData)
#            do not insert data into repo
#            self.initiateContentStoreInsertion("/ndn/edu/ucla/remap/ndnfit/repo", outerData)
#            print "Calculation completed, put data to repo"
        else:
            print "Encrypt result is not implemented"

    def onConsumeFailed(self, code, message, producedDataName, outerDataName):
        print "Consume error " + str(code) + ": " + message
        if producedDataName in self._tasks:
            self._tasks[producedDataName]["current_num"] += 1
#            print self._tasks[producedDataName]["current_num"]
            if self._tasks[producedDataName]["current_num"] == self._tasks[producedDataName]["cap_num"]:
                self.produceResult(producedDataName, outerDataName)

    def onCosumerTimeout(self, interest, producedDataName, outerDataName):
        print "Consume " + interest.getName.toUri() + " time out"
        if producedDataName in self._tasks:
            self._tasks[producedDataName]["current_num"] += 1
#            print self._tasks[producedDataName]["current_num"]
            if self._tasks[producedDataName]["current_num"] == self._tasks[producedDataName]["cap_num"]:
                self.produceResult(producedDataName, outerDataName)

    def initiateContentStoreInsertion(self, repoCommandPrefix, data):
        fetchName = data.getName()
        parameter = repo_command_parameter_pb2.RepoCommandParameterMessage()
        # Add the Name.
        for i in range(fetchName.size()):
            parameter.repo_command_parameter.name.component.append(
              fetchName[i].getValue().toBytes())

        # Create the command interest.
        interest = Interest(Name(repoCommandPrefix).append("insert")
          .append(Name.Component(ProtobufTlv.encode(parameter))))
        self.face.makeCommandInterest(interest)

        self.face.expressInterest(interest, self.onRepoData, self.onRepoTimeout)

    def onRepoData(self, interest, data):
        #print "received repo data: " + interest.getName().toUri()
        return

    def onRepoTimeout(self, interest):
        #print "repo command times out: " + interest.getName().getPrefix(-1).toUri()
        return

def usage():
    print "usage:  python2 dpu.py [-h] [-p <prefix>] [-e] [-l <link>]"
    print ""
    print "Command Summary:"
    print " -h, --help                 display help messages"
    print " -p, --prefix <prefix>      configure the prefix"
    print " -e, --encrypt-result       decide whether to encrypt processed result or not"
    print " -l, --link                 link used to fetch"
    return

if __name__ == "__main__":
    # print "Start NAC dpu test"
    # utcNow = datetime.datetime.utcnow()
    # utcNowStr = utcNow.strftime('%Y%m%dT%H%M%S')
    # utcNowWholeHour = utcNow.strftime('%Y%m%dT%H0000')

    try:
        opts, args = getopt.getopt(sys.argv[1:], "help", ["--help", "prefix=", "encrypt-result", "link="])
    except getopt.GetoptError as err:
        print str(err)
        usage()
        sys.exit(2)
    
    defaultPrefix = "/org/openmhealth/haitao"
    encryptResult = False
    link = None

    for o, a in opts:
        if o in ("-h", "--help"):
            usage()
            sys.exit()
        elif o in ("-p", "--prefix"):
            defaultPrefix = a
        elif o in ("-e", "--encrypt-result"):
            encryptResult = a 
        elif o in ("-l", "--link"):
            link = a
        else:
            assert False, "unhandled option"

    face = Face()
    DPU = DPU(face, encryptResult, defaultPrefix, link)

    while True:
        face.processEvents()
        # We need to sleep for a few milliseconds so we don't use 100% of the CPU.
        time.sleep(0.01)
