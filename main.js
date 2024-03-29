// import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import "firebase/database";



const firebaseConfig = {
  apiKey: "AIzaSyA5DuOXQlt0K63iw4h23wFYOWdMgKOE2I4",
  authDomain: "pigeon-98944.firebaseapp.com",
  databaseURL: "https://pigeon-98944-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pigeon-98944",
  storageBucket: "pigeon-98944.appspot.com",
  messagingSenderId: "916654692678",
  appId: "1:916654692678:web:578179ab126c1b11f82d47",
  measurementId: "G-NKRKYMC1VX"
};



if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const swapCameraButton = document.getElementById('swapCameraButton');
const muteMicButton = document.getElementById('muteMicButton');
const videoContainer = document.querySelector('.video-container');
const buttonContainer = document.querySelector('.button-container');
const progressContainer = document.getElementById('progressContainer');


// Hide the remote video initially
remoteVideo.style.display = 'none';

// Listen for the 'loadedmetadata' event to detect when the stream is available
remoteVideo.onloadedmetadata = () => {
  // Check if the stream is available
  if (remoteVideo.srcObject) {
    // If the stream is available, hide the progress bar and show the video
    progressContainer.style.display = 'none';
    remoteVideo.style.display = 'block';
  }
};

// If 'loadedmetadata' event is not fired within a certain time, show the progress bar
setTimeout(() => {
  if (!remoteVideo.srcObject) {
    progressContainer.style.display = 'flex';
  }
}
)

// 1. Setup media sources

var connId = Android.getConnId();
var sender = Android.getSenderId();
var receiver = Android.getReceiverId();




Android.showToast("Data received:  sender : " + sender + " connection id : " + connId + "receiver : "+receiver)


startCam(connId, sender, receiver)


async function startCam(connId, senderId, receiverId) {
  let constraints = {
    video: { facingMode: 'user' }, // Select front camera
    audio: true
  };


  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  if (connId === null || connId === undefined || connId === "") {
    createOffer(senderId, receiverId);
  } else {
    answerCall(connId, senderId, receiverId);
  }
}



hangupButton.addEventListener('click', hangup);
swapCameraButton.addEventListener('click', swapCamera);
muteMicButton.addEventListener('click', toggleMuteMic);


// 2. Create an offer
async function createOffer(senderId, receiverId) {


  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');


  Android.showToast("Offer created here is connection id : " + callDoc.id)


  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  const database = firebase.database();

  Android.showToast("Adding reqeuest to db")


  // Store connection ID in Realtime Database
  database.ref('callRequests/' + receiverId).update({
    callAccepted: false,
    callRejected: false,
    connectionId: callDoc.id,
    sender:senderId,
    isHangout: false,
    timestamp:getCurrentDateandTime(),

  })

  Android.showToast("Request added")

  




  // Android.showToast("Offer created")

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });


}

// 3. Answer the call with the unique ID
async function answerCall(connId, senderId, receiverId) {
  const callId = connId;
  Android.showToast("connection id from js : " + connId)
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');
  // console.log('-------',callDoc)


  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });



  
  const database = firebase.database();
// update accepted status
database.ref('callRequests/' + receiverId).update({
  callAccepted: true,
});
};





// Function to hang up the call
function hangup() {
  // Android.showToast("form hangup : " + guard)
  //  hangup field in realtime db
  const database = firebase.database();


  database.ref('callRequests/' + receiver).update({
    isHangout: true,
  });

  database.ref('callRequests/' + receiver).update({
    isHangout: true,
  });


  // Remove all elements
  remoteVideo.srcObject = null;
  webcamVideo.srcObject = null;

  videoContainer.innerHTML = '';

  // Display "Call Completed" text
  const callCompletedText = document.createElement('h2');
  callCompletedText.textContent = 'Call ended. You can go back.';
  callCompletedText.style.fontSize = '24px';
  callCompletedText.style.color = '#3498db';
  callCompletedText.style.textAlign = 'center';
  callCompletedText.style.position = 'absolute';
  callCompletedText.style.top = '50%';
  callCompletedText.style.left = '50%';
  callCompletedText.style.transform = 'translate(-50%, -50%)';
  document.body.appendChild(callCompletedText);

  // Disable buttons after hangup
  hangupButton.disabled = true;
  swapCameraButton.disabled = true;
  muteMicButton.disabled = true;
  // disableCameraButton.disabled = true;
  buttonContainer.style.display = 'none';


  Android.showToast('Call ended')
}

async function swapCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length < 2) {
      Android.showToast('No additional camera found');
      return;
    }

    const currentVideoTrack = localStream.getVideoTracks()[0];
    const currentDeviceId = currentVideoTrack.getSettings().deviceId;

    const currentDevice = videoDevices.find(device => device.deviceId === currentDeviceId);
    const currentFacingMode = currentDevice.label.toLowerCase().includes('front') ? 'user' : 'environment';

    let newFacingMode = '';
    if (currentFacingMode === 'user') {
      newFacingMode = 'environment'; // Switch to back camera
    } else {
      newFacingMode = 'user'; // Switch to front camera
    }

    const constraints = {
      video: { facingMode: newFacingMode },
      audio: true,
    };


    localStream.getTracks().forEach(track => track.stop());


    const newStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Replace the video track in the stream
    localStream.removeTrack(currentVideoTrack);
    localStream.addTrack(newStream.getVideoTracks()[0]);

    // Replace the track in the peer connection
    const sender = pc.getSenders().find(s => s.track === currentVideoTrack);
    sender.replaceTrack(newStream.getVideoTracks()[0]);

  } catch (error) {
    Android.showToast('Unable to change camera ! ');
    console.error('Error swapping camera:', error);
  }
}



// Function to mute/unmute the microphone
function toggleMuteMic() {
  // Toggle audio tracks
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;

  });
  changeMicImage();


  // toggle image
  console.log('Microphone toggled');
}

function changeMicImage() {
  const muteMicButton = document.getElementById("muteMicButton");
  const muteMicImage = muteMicButton.querySelector('img');

  if (muteMicImage.src.includes("unmuted.png")) {
    muteMicButton.innerHTML = '<img src="./icons/muted.png" />';
  } else {
    console.log("i am setting muted")
    muteMicButton.innerHTML = '<img src="./icons/unmuted.png" />';
  }
}





function getCurrentDateandTime() {
  const currentDate = new Date();

  const year = currentDate.getUTCFullYear();
  const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0'); 
  const day = String(currentDate.getUTCDate()).padStart(2, '0');

  const hours = String(currentDate.getUTCHours()).padStart(2, '0');
  const minutes = String(currentDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(currentDate.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(currentDate.getUTCMilliseconds()).padStart(3, '0');

  const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;

  return formattedDateTime;
}

