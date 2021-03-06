import { Template } from 'meteor/templating'
import { Blaze } from 'meteor/blaze'
import { sprintf } from 'meteor/sgi:sprintfjs'

import { formatNumber } from '/imports/lib/utils.js'
import { getUserPTIAddress } from '/imports/api/users.js'
import { UserTransactions } from '/imports/api/transactions.js'
import { Videos } from '../../../api/videos.js'
import { createWebtorrentPlayer } from './webtorrent.js'
import { createIPFSPlayer } from './ipfs.js'

import './player.html'

let fullscreenOn = false
let controlsHandler
let volumeHandler
let previousVolume = 100
let _video

function getVideo () {
  const videoId = FlowRouter.getParam('_id')
  if (!_video || _video.id !== videoId) {
    _video = Videos.findOne({ _id: videoId })
  }
  return _video
};

function renderVideoElement (instance) {
  // adds the source to the vidoe element on this page
  const currentVideo = getVideo()
  console.log('currentvideo', currentVideo)
  console.log('instance', instance)
  if (currentVideo.src.startsWith('magnet:')) {
    createWebtorrentPlayer(instance, currentVideo)
    instance.playerState.set('torrent', true)
  } else if (currentVideo.src.startsWith('/ipfs')) {
    createIPFSPlayer(instance, currentVideo)
    instance.playerState.set('ipfs', true)
  } else {
    const videoElement = $('#video-player')
    const sourceElement = document.createElement('source')
    console.log(currentVideo.src)
    sourceElement.src = currentVideo.src
    sourceElement.type = currentVideo.mimetype
    videoElement.append(sourceElement)
  }
}

Template.player.onCreated(function () {
  const self = this
  const userPTIAddress = getUserPTIAddress()
  const instance = Template.instance()
  const bodyView = Blaze.getView('Template.App_body')

  // this makes the tests work
  this.navState = bodyView ? bodyView.templateInstance().navState : new ReactiveVar('minimized')

  this.playerState = new ReactiveDict()
  this.playerState.set('playing', false)
  this.playerState.set('currentTime', 0)
  this.playerState.set('totalTime', 0)
  this.playerState.set('hideControls', false)
  this.playerState.set('showVolume', false)
  this.playerState.set('loadedProgress', 0.0)
  this.playerState.set('playedProgress', 0.0)
  this.playerState.set('scrubberTranslate', 0)
  this.playerState.set('torrent', false)
  this.playerState.set('volumeValue', 100)
  this.playerState.set('volScrubberTranslate', 100)
  this.playerState.set('muted', false)
  this.playerState.set('locked', true)

  if (userPTIAddress) {
    Meteor.subscribe('userTransactions', userPTIAddress)
  }
  Meteor.subscribe('videoPlay', FlowRouter.getParam('_id'))

  let query = UserTransactions.find({videoid: FlowRouter.getParam('_id')})
  query.observeChanges({
    added: function (id, fields) {
      console.log('added')
      console.log(id)
      console.log(fields)
      self.playerState.set('locked', false)
    },
    changed: function (id, fields) {
      console.log('changed')
      console.log(id)
      console.log(fields)
      // self.playerState.set('locked', false);
    }
  })

  Meteor.call('videos.isLocked', FlowRouter.getParam('_id'), getUserPTIAddress(), function (err, results) {
    if (err) {
      throw err
    } else {
      self.playerState.set('locked', results)
      renderVideoElement(instance)
    }
  })
})

Template.player.onDestroyed(function () {
  Meteor.clearTimeout(controlsHandler)
})

Template.player.helpers({
  isLocked () {
    return Template.instance().playerState.get('locked')
  },
  canAutoplay () {
    const locked = Template.instance().playerState.get('locked')
    if (!locked) {
      // Template.instance().navState.set('closed');
      return 'autoplay'
    } else {
      return ''
    }
  },
  playPause () {
    return Template.instance().playerState.get('playing') ? 'pause' : 'play'
  },
  playPauseIcon () {
    const state = Template.instance().playerState.get('layeplaying')
    return (state) ? '/img/pause-icon.svg' : '/img/play-icon.svg'
  },
  currentTime () {
    return Template.instance().playerState.get('currentTime')
  },
  totalTime () {
    return Template.instance().playerState.get('totalTime')
  },
  video () {
    return getVideo()
  },
  hasPrice () {
    return getVideo().price && getVideo().price > 0
  },
  hideControls () {
    return Template.instance().playerState.get('hideControls') ? 'toggleFade' : ''
  },
  formatNumber (number) {
    return formatNumber(number)
  },
  formatTime (seconds) {
    const minutes = seconds / 60
    const remainingSeconds = seconds % 60
    return sprintf('%02d:%02d', minutes, remainingSeconds)
  },
  volumeClass () {
    return Template.instance().playerState.get('showVolume') ? '' : 'closed'
  },
  playedProgress () {
    return Template.instance().playerState.get('playedProgress')
  },
  loadedProgress () {
    return Template.instance().playerState.get('loadedProgress')
  },
  scrubberTranslate () {
    return Template.instance().playerState.get('scrubberTranslate')
  },
  status () {
    return Template.instance().playerState.get('status')
  },
  volumeValue () {
    return Template.instance().playerState.get('volumeValue')
  },
  volScrubberTranslate () {
    return Template.instance().playerState.get('volScrubberTranslate')
  },
  volumeIcon () {
    const state = Template.instance().playerState.get('muted')
    return (state) ? '/img/mute-icon.svg' : '/img/volume-icon.svg'
  }
})

const requestFullscreen = (element) => {
  if (element.requestFullscreen) {
    element.requestFullscreen()
  } else if (element.mozRequestFullScreen) {
    element.mozRequestFullScreen()
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen()
  } else {
    // console.log('Unsuported fullscreen.');
  }
}

const requestCancelFullscreen = (element) => {
  if (element.exitFullscreen) {
    element.exitFullscreen()
  } else if (element.mozCancelFullScreen) {
    element.mozCancelFullScreen()
  } else if (element.webkitExitFullscreen) {
    element.webkitExitFullscreen()
  } else {
    // console.log('Unsuported fullscreen.');
  }
}

const pauseVideo = (instance) => {
  instance.playerState.set('playing', false)
  instance.navState.set('minimized')
  instance.find('#video-player').pause()
  Meteor.clearTimeout(controlsHandler)
  instance.playerState.set('hideControls', false)
  $('#app-container').removeClass('playing')
}

// Set a value (0 ~ 1) to the player volume and volume UX
const setVolume = (instance, value) => {
  const videoPlayer = instance.find('#video-player')
  videoPlayer.volume = value
  instance.playerState.set('volumeValue', value * 100)
  instance.playerState.set('volScrubberTranslate', value * 100)
  if (value > 0) {
    instance.playerState.set('muted', false)
  } else {
    instance.playerState.set('muted', true)
  }
}

const setLoadedProgress = (instance) => {
  const videoPlayer = instance.find('#video-player')
  const torrent = instance.playerState.get('torrent')
  if (videoPlayer.buffered.length > 0 && !torrent) {
    const played = instance.playerState.get('playedProgress')
    let loaded = 0.0
    // get the nearst end
    for (let i = 0; i < videoPlayer.buffered.length; i += 1) {
      if (loaded <= played) {
        loaded = videoPlayer.buffered.end(i) / videoPlayer.duration
      }
    }
    instance.playerState.set('loadedProgress', loaded * 100)
  }
}

Template.player.events({
  'click #unlock-video' (event) {
    Modal.show('doTransaction', {
      type: 'PTI',
      label: 'Unlock this video',
      action: 'unlock_video',
      price: event.target.dataset.price, // Video Price
      address: event.target.dataset.address, // Creator PTI address
      videotitle: event.target.dataset.title, // Video title
      videoid: _video._id // Video title
    })
  },
  'ended #video-player' (event, instance) {
    const navState = instance.navState
    instance.playerState.set('playing', false)
    navState.set('minimized')
  },
  'click #play-pause-button' (event, instance) {
    const dict = instance.playerState
    const navState = instance.navState
    const videoPlayer = instance.find('#video-player')
    if (dict.get('playing')) {
      pauseVideo(instance)
    } else {
      dict.set('playing', true)
      navState.set('closed')
      videoPlayer.play()
      $('#app-container').addClass('playing')
      controlsHandler = Meteor.setTimeout(() => {
        if (!videoPlayer.paused) {
          dict.set('hideControls', true)
        }
      }, 3000)
    }
  },
  'click #fullscreen-button' (event, instance) {
    const videoPlayer = instance.find('#player-container')
    if (fullscreenOn) {
      requestCancelFullscreen(document)
      fullscreenOn = false
    } else {
      requestFullscreen(videoPlayer)
      fullscreenOn = true
    }
  },
  'timeupdate' (event, instance) {
    const videoPlayer = instance.find('#video-player')
    const time = videoPlayer.currentTime
    const dict = instance.playerState

    // update progress bar
    dict.set('playedProgress', (time / videoPlayer.duration) * 100)
    dict.set('scrubberTranslate', 100 * (time / videoPlayer.duration))

    // update current time
    dict.set('currentTime', time)
    setLoadedProgress(instance)
  },
  'progress #video-player' (event, instance) {
    setLoadedProgress(instance)
  },
  'mouseup' () {
    $(document).off('mousemove')
  },
  'mousedown #scrubber' (event, instance) {
    $(document).mousemove((e) => {
      const videoPlayer = instance.find('#video-player')
      const progress = instance.find('#video-progress')
      const barWidth = progress.offsetWidth
      const offset = e.clientX - progress.getBoundingClientRect().left
      videoPlayer.currentTime = (offset / barWidth) * videoPlayer.duration
      instance.playerState.set('playedProgress', (offset / barWidth) * 100)
      instance.playerState.set('scrubberTranslate', (offset / barWidth) * 100)
    })
  },
  'click #video-progress' (event, instance) {
    const videoPlayer = instance.find('#video-player')
    const barWidth = instance.find('#video-progress').offsetWidth
    const offset = event.clientX - event.currentTarget.getBoundingClientRect().left
    videoPlayer.currentTime = (offset / barWidth) * videoPlayer.duration
    instance.playerState.set('playedProgress', (offset / barWidth) * 100)
    instance.playerState.set('scrubberTranslate', (offset / barWidth) * 100)
  },
  'click #vol-control' (event, instance) {
    const barWidth = instance.find('#vol-control').offsetWidth
    const offset = event.clientX - event.currentTarget.getBoundingClientRect().left
    setVolume(instance, offset / barWidth)
  },
  'mousedown #vol-scrubber' (event, instance) {
    $(document).mousemove((e) => {
      const volume = instance.find('#vol-control')
      const barWidth = volume.offsetWidth
      const offset = e.clientX - volume.getBoundingClientRect().left
      setVolume(instance, offset / barWidth)
    })
  },
  'loadedmetadata' (event, instance) {
    const videoPlayer = instance.find('#video-player')
    const duration = Math.floor(videoPlayer.duration)
    instance.playerState.set('totalTime', duration)
    instance.playerState.set('currentTime', 0)
    setLoadedProgress(instance)
  },
  'mousemove' (event, instance) {
    const dict = instance.playerState
    const videoPlayer = instance.find('#video-player')
    dict.set('hideControls', false)
    Meteor.clearTimeout(controlsHandler)
    controlsHandler = Meteor.setTimeout(() => {
      if (!videoPlayer.paused) {
        dict.set('hideControls', true)
      }
    }, 3000)
  },
  'click #video-player' (event, instance) {
    pauseVideo(instance)
  },
  'mouseover #volume-button, mouseover #vol-control' (event, instance) {
    Meteor.clearTimeout(volumeHandler)
    instance.playerState.set('showVolume', true)
  },
  'mouseout #volume-button, mouseout #vol-control' (event, instance) {
    volumeHandler = Meteor.setTimeout(() => {
      instance.playerState.set('showVolume', false)
    }, 1000)
  },
  'click #volume-button' (event, instance) {
    const videoPlayer = instance.find('#video-player')
    if (videoPlayer.volume > 0) {
      previousVolume = videoPlayer.volume
      setVolume(instance, 0)
    } else {
      setVolume(instance, previousVolume)
    }
  },
  'click #button-like' () {
    const videoId = _video._id
    // const videoId = this._id // works as well
    Meteor.call('videos.like', videoId)
  },
  'click #button-dislike' () {
    const videoId = _video._id
    Meteor.call('videos.dislike', videoId)
  }
})
