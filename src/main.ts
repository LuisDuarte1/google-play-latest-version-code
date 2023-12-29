import * as core from '@actions/core'
import { writeFile } from 'fs/promises'
import { google } from 'googleapis'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.debug('Reading service account json file')
    const service_account_content: string = core.getInput(
      'google_service_account_json'
    )
    await writeFile('/tmp/google-service-account.json', service_account_content)

    const auth = new google.auth.GoogleAuth({
      keyFile: '/tmp/google-service-account.json',
      scopes: ['https://www.googleapis.com/auth/androidpublisher']
    })

    google.options({
      auth
    })

    //first we create a edit in order to access the package bundle list
    const androidDevelopersAPI = google.androidpublisher({
      version: 'v3'
    })

    const packageName: string = core.getInput('package_name')

    const createEditReq = await androidDevelopersAPI.edits.insert({
      packageName
    })

    const editId = createEditReq.data.id

    if (editId === null) {
      throw Error(
        `The API did not return a editId. Response Status: ${createEditReq.status}`
      )
    }

    const bundlesReq = await androidDevelopersAPI.edits.bundles.list({
      packageName,
      editId
    })

    const bundles = bundlesReq.data.bundles

    if (bundles === undefined || bundles.length === 0) {
      throw Error(
        `The API did not return the list of bundles. Response Status: ${createEditReq.status}. It's maybe possible that you still don't have a bundle submitted to the Google Play Console.`
      )
    }

    const lastBundle = bundles.at(-1)
    core.setOutput('latest_version_code', lastBundle?.versionCode)

    const track = core.getInput('track')
    if (track !== '') {
      const tracksReq = await androidDevelopersAPI.edits.tracks.list({
        packageName,
        editId
      })

      const tracks = tracksReq.data.tracks

      if (tracks === undefined || bundles.length === 0) {
        throw Error(
          `The API did not return the list of tracks. Response Status: ${createEditReq.status}. It's maybe possible that you still don't have active tracks in the Google Play Console.`
        )
      }
      const trackObj = tracks.filter(obj => obj.track === track).at(0) //is there only one active release always?

      if (trackObj === undefined) {
        throw Error(
          `Could not find the ${track} track in the returned list of tracks.`
        )
      }

      core.setOutput('latest_version_name', trackObj.releases?.at(0)?.name)
    }

    await androidDevelopersAPI.edits.delete({ editId, packageName })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
