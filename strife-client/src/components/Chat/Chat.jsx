import React, { useState, useEffect, useRef, useContext } from 'react';
import { useHistory } from 'react-router';
import { checkLoggedIn } from '../../services/login-service.js';
import { io } from 'socket.io-client';
import { Typography, Dialog, DialogContent, DialogTitle, Box } from '@material-ui/core';
import Grid from '@material-ui/core/Grid';
import Loading from './Loading.jsx';
import RoomsList from './Sidebar/RoomsList.jsx';
import FriendsList from './Sidebar/FriendsList.jsx';
import Header from './Header/Header.jsx';
import ChatBox from './ChatBox.jsx';
import LandingChatBox from './LandingChatBox.jsx';
import chatStyles from '../styles/chat-styles.js';
import { UserContext } from '../../UserContext.js';

export default function Chat() {
    const classes = chatStyles();
    const history = useHistory();
    const socket = useRef();
    const [socketConnected, setSocketConnected] = useState(false);
    const { user, setUser } = useContext(UserContext);
    const [loadingStages, setLoadingStages] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [showChatAlreadyOpen, setShowChatAlreadyOpen] = useState(false);
    const [onlineRoomsList, setOnlineRoomsList] = useState([]);
    const [onlineMembers, setOnlineMembers] = useState(new Map());
    const [friendsList, setFriendsList] = useState([]);
    const [recipient, setRecipient] = useState("");
    // TODO: Convert msgList into a hashmap
    const [msgList, setMsgList] = useState([])

    useEffect(() => {
        // TODO: Probably find a better way to do this
        if (loadingStages.includes("loggedIn")
            && loadingStages.includes("socketConnected")
            && loadingStages.includes("fetchedFriendsList")) {
            setLoaded(true);
        }
    }, [loadingStages])

    useEffect(() => {
        (async function () {
            const isUserLoggedIn = await checkLoggedIn();
            console.log("isUserLoggedIn: ", isUserLoggedIn);
            if (isUserLoggedIn.username != null && isUserLoggedIn.username.length !== 0) {
                console.log("You're logged in!");
                setLoadingStages(oldList => [...oldList, "loggedIn"]);

                setUser({ username: isUserLoggedIn.username, avatar: isUserLoggedIn.avatar, accessToken: isUserLoggedIn.accessToken });
                // If the user is logged in, setup the socket connection
                socket.current = io.connect("http://localhost:5000");
                socket.current.on("connect", () => {
                    // Send username to server
                    socket.current.emit("username", isUserLoggedIn.username);
                    setLoadingStages(oldList => [...oldList, "socketConnected"]);
                    setSocketConnected(true);
                });

                socket.current.on("echo-msg", (echoMessage) => {
                    //console.log(`echo message: ${echoMessage} user: ${socketid}`);
                    updateMessageList(echoMessage);
                });

                socket.current.on('new-user-online', (newOnlineUsersList) => {
                    //console.log("newOnlineUsersList: ", newOnlineUsersList);
                    requestFriendsList([isUserLoggedIn.username]);
                });

                // Receive announcements from the server
                socket.current.on('system-msg', (systemMsg) => {
                    const newMsg = { message: systemMsg, avatar: null, systemMsg: true }
                    updateMessageList(newMsg);
                })

                // Receive friends list from server
                socket.current.on('friends-list', (friendsListFromServer) => {
                    console.log("friendsListFromServer:", friendsListFromServer);
                    setFriendsList(friendsListFromServer);
                    setLoadingStages(oldList => [...oldList, "fetchedFriendsList"]);
                });

                // Receive msg history from server
                socket.current.on('receive-msg-history', (msgHistory) => {
                    console.log("Received msg history from server: ", msgHistory);
                    setMsgList(msgHistory);
                });

                // Receive rooms map from server
                socket.current.on('rooms-list', (roomsList) => {
                    setOnlineRoomsList(roomsList);
                    console.log(roomsList);
                });

                // Receive updated room members list from server
                socket.current.on('updated-room-members', (roomname, updatedMembersList) => {
                    setOnlineMembers(new Map(onlineMembers.set(roomname, updatedMembersList)));
                });

                // Receive error from server if user is already online elsewhere
                socket.current.on('chat-already-open', () => {
                    setShowChatAlreadyOpen(true);
                })
            }
            else {
                console.log("You're NOT logged in!");
                setUser({ username: null, accessToken: null })
                history.push('/login');
            }
        })();
    }, [])

    useEffect(() => {
        setMsgList([]);
        // TODO: Only start listening for recipient change after socket has finished connecting
        if (socketConnected) {
            socket.current.emit('request-msg-history', user.username, recipient.username, recipient.isRoom);
        }
    }, [recipient])

    function manageRooms(action, roomname, callback) {
        switch (action) {
            case 'join': console.log('Joining room:', roomname);
                socket.current.emit('join-room', roomname, user.username, (response) => {
                    if (response.status == "success") {
                        setOnlineMembers(new Map(onlineMembers.set(roomname, response.members)));
                        callback(true, roomname);
                    }
                    else callback(false, roomname);
                });
                break;

            case 'create': console.log('Creating room:', roomname);
                socket.current.emit('create-room', roomname, user.username, (response) => {
                    if (response.status == "success") {
                        setOnlineMembers(new Map(onlineMembers.set(roomname, response.members)));
                        callback(true, roomname);
                    }
                    else callback(false, roomname);
                });
                break;

            case 'leave': console.log('Leaving room:', roomname);
                socket.current.emit('leave-room', roomname, user.username);
                break;
        }
    }

    function requestFriendsList(usernameList) {
        socket.current.emit('request-friends-list', usernameList);
    }

    function sendMessage(msgData) {
        if (!msgData.message.match(/^ *$/) && msgData.message != null) {
            socket.current.emit('add-msg', msgData, new Date().getTime());
            updateMessageList(msgData);
        }
    }

    function updateMessageList(msgData) {
        //console.log(msgList);
        setMsgList(oldList => [...oldList, msgData]);
    }

    return (
        // Show error dialog if multiple instances of Strife are running (user is already online)
        <div>
            <Dialog open={showChatAlreadyOpen} style={{
                backdropFilter: "blur(15px)",
                backgroundColor: 'rgba(0,0,30,0.4)'
            }}>
                <DialogTitle style={{
                    fontWeight: 'bold',
                    fontFamily: "'Syne', sans-serif",
                    fontVariant: 'small-caps',
                    letterSpacing: '15px'
                }}>uh oh</DialogTitle>
                <DialogContent>
                    <div style={{ margin: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img src={process.env.PUBLIC_URL + '/images/uhoh.svg'} height="150" width="150" />
                        <Typography variant="h4" style={{
                            fontWeight: 'bold',
                            fontFamily: "'Syne', sans-serif"
                        }}>You already have Strife open somewhere</Typography>
                        <Typography style={{
                            fontFamily: "'Rubik', sans-serif"
                        }}>You can only run one instance of Strife at a time :c</Typography>
                    </div>
                </DialogContent>
            </Dialog>
            <Grid container spacing={2} style={{
                maxHeight: '100vh', margin: 0,
                width: '100%',
            }}>
                <Grid item xs={12} style={{ height: '20vh', padding: '0px' }}>
                    <Header setRecipient={setRecipient} requestFriendsList={requestFriendsList} manageRooms={manageRooms} />
                </Grid>
                {loaded ? <><Grid item xs={2} style={{ height: '80vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <RoomsList roomsList={onlineRoomsList != null ? onlineRoomsList : []} setRecipient={setRecipient} manageRooms={manageRooms} />
                    <Box m={0.5} />
                    <FriendsList friendsList={friendsList} setRecipient={setRecipient} />
                </Grid>
                    <Grid item xs={10} style={{ height: '80vh', display: 'flex', flexFlow: 'column' }}>
                        {
                            recipient == "" ? <LandingChatBox /> : <ChatBox
                                msgList={msgList}
                                sendMessage={sendMessage}
                                recipient={recipient}
                                setRecipient={setRecipient}
                                sender={user}
                                onlineMembers={onlineMembers}
                                manageRooms={manageRooms}
                            />
                        }
                    </Grid></> :
                    <Grid item xs={12} style={{ height: '80vh' }}>
                        <Loading />
                    </Grid>
                }
            </Grid>
        </div>
    );
}
