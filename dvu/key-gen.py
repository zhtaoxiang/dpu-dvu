import unittest as ut
import os, time, base64, re, json, sys, getopt
from pyndn import Name, Data, Face, Interest, Link
from pyndn.util import Blob, MemoryContentCache
from pyndn.encrypt import Schedule, Consumer, Sqlite3ConsumerDb, EncryptedContent

from pyndn.security import KeyType, KeyChain, RsaKeyParams, SecurityException
from pyndn.security.certificate import IdentityCertificate
from pyndn.security.identity import IdentityManager
from pyndn.security.identity import BasicIdentityStorage, FilePrivateKeyStorage, MemoryIdentityStorage, MemoryPrivateKeyStorage
from pyndn.security.policy import NoVerifyPolicyManager

# Set up the keyChain.
identityStorage = BasicIdentityStorage()
privateKeyStorage = FilePrivateKeyStorage()
keyChain = KeyChain(
          IdentityManager(identityStorage, privateKeyStorage),
          NoVerifyPolicyManager())

# dvu identity
identityName = Name("/org/openmhealth/dvu")
certificateName = keyChain.createIdentityAndCertificate(identityName)
keyName = IdentityCertificate.certificateNameToPublicKeyName(certificateName)
certificate = identityStorage.getCertificate(certificateName)
print keyName
print certificateName
print certificate
print privateKeyStorage.nameTransform(keyName.toUri(), ".pri")
#with open(privateKeyStorage.nameTransform(keyName.toUri(), ".pri")) as keyFile:
#    base64Content = keyFile.read()
#    decoded = base64.b64decode(base64Content)
#    print decoded
#    for i in range(0, len(decoded)):
#        print int(decoded[i])
face = Face()
face.setCommandSigningInfo(keyChain, certificateName)
certificateNamePrefix = Name(identityName).append("KEY")
def onInterest(prefix, interest, face, interestFilterId, filter):
    print interest
    face.putData(certificate)
def onRegisterFailed(prefix):
    print "register prefix failed!"
face.registerPrefix(certificateNamePrefix, onInterest, onRegisterFailed) 
while True:
    face.processEvents()
    time.sleep(0.01)
