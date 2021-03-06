import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import {getSavedPictures,savePictures} from './image-indexer'
import getExif from './exif-service'
import moment from 'moment'
import Promise from "bluebird"
import { createThumbnailProcess, createThumbnailProcessAll } from '../services/thumbnail-service'
import {ipcMain} from 'electron'

export class ImageFiles {

  constructor(){
    var user = process.env.HOME || process.env.USERPROFILE;
    var dropbox = path.join(user, 'Pictures');
    var pictures = path.join(user, 'Google Drive', 'Camera Uploads');
    this.pictureFolders = [dropbox, pictures];
    ipcMain.on('start', this.getNewAndOld.bind(this));
    ipcMain.on('thumb', this.getThumb.bind(this))
  }

  getThumb(event, arg){
    createThumbnailProcess(arg)
      .then((result)=> event.sender.send('thumbdone', result))
  }

  findImages(folder){
    var pictureFiles = fs.readdirSync(folder);
  	var images = pictureFiles.filter(this.filterImages);
    return images;
  }

  filterImages(file){
    return file.indexOf('.jpg') !== -1 ||
      file.indexOf('.jpeg') !== -1 ||
      file.indexOf('.png') !== -1;
  }

  getImagesAndFileDetails(folder){
    return this.findImages(folder).map((img)=>{
      return {
        file: img,
  			path: path.join(folder, img), //TODO: FIX FOLDER
  			fstat: fs.statSync(path.join(folder, img))
      }
    });
  }

  getNewAndOld(event){
    var allFiles = [];
    var exifPromies = [];
    getSavedPictures((err, savedFiles)=>{
    
      if(err){
        savedFiles = [];
      }else{
        savedFiles = JSON.parse(savedFiles);
      }

      this.pictureFolders.forEach((folder)=>{
          var newFiles = this.getImagesAndFileDetails(folder);
          
          newFiles.map((picture)=>{
              picture.dateTime = moment(0);
              picture.date = '';
              if(picture.path.indexOf(".png") === -1){
                  exifPromies.push(getExif(picture.path)
                      .then((exifData)=>{
                          if(exifData){
                            picture.exif = exifData;
                              this.getCreatedDate(picture);
                          }
                          return picture;
                      }));
              }
              return picture;
          });
          
          allFiles = allFiles.concat(newFiles);
      }); 

      Promise.all(exifPromies)
          .then((files)=>{
              
              let onlyNew = _.filter(allFiles, (img)=>{
                let isOld = _.some(savedFiles, function(im){
                  return im.file.trim() === img.file.trim();
                });
                
                if(!isOld){
                  let found = _.find(savedFiles, {'file': img.file})
                  console.log(img.file, found && found.file);
                }
                return !isOld;
              });
              
              let all = savedFiles.concat(onlyNew);

              let sorted =  _.sortBy(all, (file)=>{
                  return -file.dateTime.valueOf();
              });

              savePictures(sorted);

              event.sender.send('log', 'thumbnails');
              createThumbnailProcessAll(event);

              event.sender.send('done', sorted);
              return sorted;
          });
    });
  }

  getNewFiles(saved, allFiles){
  	 return _.filter(allFiles, function(file){
  		 return !_.find(saved, function(savedFile){
  			 return savedFile.path === file.path;
  		 });
  	 });
  }
  
  getCreatedDate(picture){
      if (picture.exif.exif.DateTimeOriginal ||picture.exif.CreatedDate) {
        picture.dateTime = moment(picture.exif.exif.DateTimeOriginal || picture.exif.exif.CreatedDate, "YYYY:MM:DD HH:mm:SS");
        picture.date = picture.dateTime.format('DD/MM/YYYY');  
    }
  }
 
}
