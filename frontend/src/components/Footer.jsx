import React from 'react'

const Footer = () => {
  return (
    <div className='flex flex-row bg-customFooter'>
      <div className='flex flex-row justify-between w-full mx-4'>
        <div className='underline text-gray-700'>
            About
        </div>
        <div className='underline text-gray-700'>
            T&C
        </div>
      </div>
    </div>
  )
}

export default Footer
