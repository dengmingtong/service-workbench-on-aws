/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License").
 *  You may not use this file except in compliance with the License.
 *  A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 *  or in the "license" file accompanying this file. This file is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *  express or implied. See the License for the specific language governing
 *  permissions and limitations under the License.
 */

import React from 'react';
import { observer } from 'mobx-react';
import { action, decorate, observable, runInAction } from 'mobx';
import { Button, Header, Modal } from 'semantic-ui-react';

import FileUpload from '../files/FileUpload';
import { getPresignedStudyUploadRequests } from '../../helpers/api';
import upload from '../../helpers/xhr-upload';

// expected props
// - studyId
class UploadStudyFiles extends React.Component {
  constructor(props) {
    super(props);
    runInAction(() => {
      this.modalOpen = false;
    });
    this.fileUploadHandler = this.fileUploadHandler.bind(this);
  }

  async fileUploadHandler(fileUpload) {
    console.log('start upload file mingtong step 1, fileUpload', fileUpload);
    const file = fileUpload.getFile();
    console.log('start upload file mingtong step 2, file', file);
    if (!file) {
      throw new Error('No file');
    }

    // Get presigned POST request
    let uploadRequest;
    try {
      console.log('start upload file mingtong step 3, fileUpload.fullFilePath', fileUpload.fullFilePath);
      const presignResult = await getPresignedStudyUploadRequests(this.props.studyId, fileUpload.fullFilePath);
      console.log('start upload file mingtong step 4, presignResult', presignResult);
      uploadRequest = presignResult[fileUpload.fullFilePath];
      console.log('start upload file mingtong step 5, uploadRequest', uploadRequest);
    } catch (error) {
      const errMessage = 'Error occurred obtaining presigned request';
      console.error(`${errMessage}:`, error);
      throw new Error(errMessage);
    }

    if (!uploadRequest) {
      throw new Error('Failed to obtain presigned request');
    }

    // Upload file
    const uploadHandle = upload(file, uploadRequest.url, uploadRequest.fields);
    console.log('start upload file mingtong step 6');
    fileUpload.setCancel(uploadHandle.cancel);
    console.log('start upload file mingtong step 7');
    uploadHandle.onProgress(fileUpload.updateProgress);

    try {
      console.log('start upload file mingtong step 8');
      await uploadHandle.done;
    } catch (error) {
      const errMessage = 'Error encountered while uploading file';
      console.error(`${errMessage}:`, error);
      throw new Error(errMessage);
    }
  }

  render() {
    return (
      <Modal
        closeIcon
        trigger={this.renderTrigger()}
        open={this.modalOpen}
        onClose={action(() => {
          this.modalOpen = false;
        })}
      >
        <div className="mt2 animated fadeIn">
          <Header as="h3" icon textAlign="center" className="mt3" color="grey">
            Upload Study Files
          </Header>
          <div className="mx3 animated fadeIn">
            <FileUpload resourceId={this.props.studyId} fileUploadHandler={this.fileUploadHandler} />
          </div>
        </div>
      </Modal>
    );
  }

  renderTrigger() {
    return (
      <Button
        floated="right"
        color="blue"
        basic
        onClick={action(() => {
          this.modalOpen = true;
        })}
      >
        Upload Files
      </Button>
    );
  }
}

decorate(UploadStudyFiles, {
  modalOpen: observable,
});

export default observer(UploadStudyFiles);
