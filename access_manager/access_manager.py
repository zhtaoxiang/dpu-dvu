import os, time, sys
from pyndn import Name, Face, Data, Interest, Exclude
from pyndn.threadsafe_face import ThreadsafeFace
from pyndn.util import Blob, MemoryContentCache
from pyndn.encrypt import GroupManager, Sqlite3GroupManagerDb, EncryptedContent
from pyndn.encrypt import Schedule, RepetitiveInterval, DecryptKey, EncryptKey

from pyndn.security import KeyChain, RsaKeyParams
from pyndn.security.identity import IdentityManager
from pyndn.security.identity import MemoryIdentityStorage, MemoryPrivateKeyStorage
from pyndn.security.policy import NoVerifyPolicyManager

import trollius as asyncio
from pyndn.encoding import ProtobufTlv
import getopt

from dpu_dvu.repo_command import repo_command_parameter_pb2
from dpu_dvu.repo_command import repo_command_response_pb2

import datetime

try:
  import xml.etree.cElementTree as ET
except ImportError:
  import xml.etree.ElementTree as ET

userprefixManagerDict = dict() # map a userPrefix to a {dataType, manager} dict

class AccessManager(object):
    def __init__(self, face, groupManagerName, dataType, dKeyDatabaseFilePath):
        # Set up face
        self.face = face
        #self.loop = eventLoop

        # Set up the keyChain.
        identityStorage = MemoryIdentityStorage()
        privateKeyStorage = MemoryPrivateKeyStorage()
        self.keyChain = KeyChain(
          IdentityManager(identityStorage, privateKeyStorage),
          NoVerifyPolicyManager())

        self.certificateName = self.keyChain.createIdentityAndCertificate(groupManagerName)

        self.dKeyDatabaseFilePath = dKeyDatabaseFilePath

        self.manager = GroupManager(
          groupManagerName, dataType,
          Sqlite3GroupManagerDb(self.dKeyDatabaseFilePath), 2048, 1,
          self.keyChain)

        self.memoryContentCache = MemoryContentCache(self.face)

        self.memoryContentCache.registerPrefix(groupManagerName, self.onRegisterFailed, self.onDataNotFound)

        self.needToPublishGroupKeys = False
        return

    def onRepoData(self, interest, data):
        #print "received repo data: " + interest.getName().toUri()
        return

    def onRepoTimeout(self, interest):
        #print "repo command times out: " + interest.getName().getPrefix(-1).toUri()
        return

    def addSchedule(self, scheduleName, managerStartDate, managerEndDate, managerStartHour, managerEndHour):
        schedule = Schedule()
        interval = RepetitiveInterval(
          Schedule.fromIsoString(managerStartDate),
          Schedule.fromIsoString(managerEndDate),
          managerStartHour, managerEndHour, 1,
          RepetitiveInterval.RepeatUnit.DAY)
        schedule.addWhiteInterval(interval)
        
        self.manager.addSchedule(scheduleName, schedule)


    def onMemberCertificateData(self, interest, data, accessInterest):
        print "Member certificate with name retrieved: " + data.getName().toUri() + "; member added to group!"
        self.manager.addMember("schedule1", data)
        self.needToPublishGroupKeys = True

        accessResponse = Data(accessInterest.getName())
        accessResponse.setContent("granted")
        self.face.putData(accessResponse)

    def onMemberCertificateTimeout(self, interest, accessInterest):
        print "Member certificate interest times out: " + interest.getName().toUri()
        newInterest = Interest(interest)
        newInterest.refreshNonce()
        self.face.expressInterest(newInterest, 
          lambda memberInterest, memberData: self.onMemberCertificateData(memberInterest, memberData, accessInterest), 
          lambda memberInterest: self.onMemberCertificateTimeout(memberInterest, accessInterest))
        return

    def publishGroupKeys(self, timeStr):
        timePoint = Schedule.fromIsoString(timeStr)
        print timeStr
        result = self.manager.getGroupKey(timePoint)

        # The first is group public key, E-key
        # The rest are group private keys encrypted with each member's public key, D-key
        for i in range(0, len(result)):
            self.memoryContentCache.add(result[i])
            self.initiateContentStoreInsertion("/ndn/edu/ucla/remap/ndnfit/repo", result[i])
            print "Publish key name: " + str(i) + " " + result[i].getName().toUri()
            print "key content: " + str(result[i].getContent().toBytes())

        self.needToPublishGroupKeys = False

    def onDataNotFound(self, prefix, interest, face, interestFilterId, filter):
        print "Data not found for interest: " + interest.getName().toUri()
        if interest.getExclude():
            print "Interest has exclude: " + interest.getExclude().toUri()
        return

    def onRegisterFailed(self, prefix):
        print "Prefix registration failed"
        return

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

def usage():
    print "Options: --start= (manager start date, like 20160620T080000) --end= (manager end date, like 20160620T080000)"
    print "--key-period= (generate keys for one period, like 20160620T083000)"
    print "--prefix= (prefix which this group manager uses, like /org/openmhealth/zhehao/)"
    print "By default we use utc now in whole hour as manager start time, one day later as end time, and utc now in whole hour to get group keys"

def parseXmlToManager(tree, face, dKeyDatabaseFilePath):
    root = tree.getroot()
    # get user prefix
    userPrefix = root[0].text
    datatypeManagerDict = userprefixManagerDict.get(userPrefix)
    if (datatypeManagerDict == None):
        datatypeManagerDict = dict()
        userprefixManagerDict[userPrefix] = datatypeManagerDict
    
    # register a prefix for consumers to request read access to a user's data
    readAccessName = Name(userPrefix).append("read_access_request")
    face.registerPrefix(readAccessName, onAccessInterest, onAccessTimeout)

    for manager in root[1]:
        dataType = manager[0].text
        # create manager
        accessManager = AccessManager(face, Name(userPrefix), dataType, dKeyDatabaseFilePath)
        # parse and add schedules
        for schedule in manager.iter('schedule'):
            scheduleName = schedule[0].text
            startDate = schedule[1].text
            endDate = schedule[2].text
            startHour = int(schedule[3].text)
            endHour = int(schedule[4].text)
            accessManager.addSchedule(scheduleName, startDate + "T000000", endDate + "T000000", startHour, endHour)
        # publish keys for the current hour
        utcNow = datetime.datetime.utcnow()
        utcNowStr = utcNow.strftime('%Y%m%dT%H%M%S')
        accessManager.publishGroupKeys(utcNowStr)
        # set up key publishing for the next hour
        utcNow = datetime.datetime.utcnow()
        utcNowHour = utcNow.strftime('%Y%m%dT%H0000')
        if utcNow < datetime.datetime.strptime(utcNowHour, '%Y%m%dT%H%M%S') + datetime.timedelta(minutes = 55):
            accessManager.needToPublishGroupKeys = True
        else:
            oneHourLater = utcNow + datetime.timedelta(hours = 1)
            accessManager.publishGroupKeys(oneHourLater.strftime('%Y%m%dT%H%M%S'))
            accessManager.needToPublishGroupKeys = False
        datatypeManagerDict[dataType] = accessManager

def onAccessInterest(prefix, interest, face, interestFilterId, filter):
    print "On Access request interest: " + interest.getName().toUri()
    certInterest = Interest(interest.getName().getSubName(4))
    certInterest.setName(certInterest.getName().getPrefix(-1))
    certInterest.setInterestLifetimeMilliseconds(2000)
        
    face.expressInterest(certInterest,
      lambda memberInterest, memberData: self.onMemberCertificateData(memberInterest, memberData, interest),
      lambda memberInterest: self.onMemberCertificateTimeout(memberInterest, interest));
    print "Retrieving member certificate: " + certInterest.getName().toUri()
                                  
    return

def onAccessTimeout(prefix):
    print "Prefix registration failed: " + prefix.toUri()
    return

if __name__ == "__main__":
    print "Start NAC group manager test"
    #tree = ET.ElementTree(file='consumer_credential_list.xml')
    
    face = Face()
    commandSigningKeyChain = KeyChain()
    face.setCommandSigningInfo(commandSigningKeyChain, commandSigningKeyChain.getDefaultCertificateName())

    dKeyDatabaseFilePath = "manager-d-key.db"
    try:
        os.remove(dKeyDatabaseFilePath)
    except OSError:
        # no such file
        pass

    tree = ET.parse('consumer_credential_list.xml')
    parseXmlToManager(tree, face, dKeyDatabaseFilePath)
    
    while True:
        utcNow = datetime.datetime.utcnow()
        utcNowHour = utcNow.strftime('%Y%m%dT%H0000')
        if utcNow < datetime.datetime.strptime(utcNowHour, '%Y%m%dT%H%M%S') + datetime.timedelta(minutes = 55):
            for user in userprefixManagerDict.values():
                for accessManager in user.values():
                    accessManager.needToPublishGroupKeys = True
        else:
            for user in userprefixManagerDict.values():
                for accessManager in user.values():
                    if accessManager.needToPublishGroupKeys == True:
                        oneHourLater = utcNow + datetime.timedelta(hours = 1)
                        accessManager.publishGroupKeys(oneHourLater.strftime('%Y%m%dT%H%M%S'))
                        accessManager.needToPublishGroupKeys = False
        interval = 0
        while interval < 100:
            face.processEvents()
            # We need to sleep for a few milliseconds so we don't use 100% of the CPU.
            time.sleep(0.01)
            interval = interval + 1
